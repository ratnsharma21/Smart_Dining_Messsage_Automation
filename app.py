import os
import datetime
from decimal import Decimal
import json
import urllib.request
import urllib.error
import smtplib
from email.mime.text import MIMEText
from email.header import Header

from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
import mysql.connector

app = Flask(__name__)
app.secret_key = "smart_dining_crm_secret_key"

# Database Connection Helper
def get_db_connection(select_db=True):
    config = {
        'host': '127.0.0.1',
        'port': 3306,
        'user': 'root',
        'password': '',
        'charset': 'utf8mb4'
    }
    if select_db:
        config['database'] = 'smart_dining_crm'
    return mysql.connector.connect(**config)

# Check Database connection and initialization status
def check_db_status():
    db_error = None
    db_initialized = False
    try:
        conn = get_db_connection(select_db=False)
        cursor = conn.cursor()
        cursor.execute("SHOW DATABASES LIKE 'smart_dining_crm'")
        db_exists = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if db_exists:
            conn = get_db_connection(select_db=True)
            cursor = conn.cursor()
            required_tables = [
                'customers', 'family_members', 'special_occasions', 'customer_preferences',
                'restaurant_visits', 'message_history', 'system_settings'
            ]
            db_initialized = True
            for tbl in required_tables:
                cursor.execute(f"SHOW TABLES LIKE '{tbl}'")
                if not cursor.fetchone():
                    db_initialized = False
                    break
            
            if db_initialized:
                # Self-healing: Ensure anniversary_date column exists in family_members
                try:
                    cursor.execute("SHOW COLUMNS FROM `family_members` LIKE 'anniversary_date'")
                    if not cursor.fetchone():
                        cursor.execute("ALTER TABLE `family_members` ADD COLUMN `anniversary_date` DATE DEFAULT NULL AFTER `date_of_birth`")
                        conn.commit()
                except Exception:
                    pass
                
                # Self-healing: Ensure delivery_type column exists in message_history
                try:
                    cursor.execute("SHOW COLUMNS FROM `message_history` LIKE 'delivery_type'")
                    if not cursor.fetchone():
                        cursor.execute("ALTER TABLE `message_history` ADD COLUMN `delivery_type` ENUM('Automated', 'Manual') DEFAULT 'Automated' AFTER `delivery_status`")
                        conn.commit()
                except Exception:
                    pass

                # Self-healing: Ensure occasion column exists in message_history
                try:
                    cursor.execute("SHOW COLUMNS FROM `message_history` LIKE 'occasion'")
                    if not cursor.fetchone():
                        cursor.execute("ALTER TABLE `message_history` ADD COLUMN `occasion` VARCHAR(50) DEFAULT NULL AFTER `delivery_type`")
                        conn.commit()
                except Exception:
                    pass

                # Self-healing: Ensure loyalty_points column exists in customers
                try:
                    cursor.execute("SHOW COLUMNS FROM `customers` LIKE 'loyalty_points'")
                    if not cursor.fetchone():
                        cursor.execute("ALTER TABLE `customers` ADD COLUMN `loyalty_points` INT DEFAULT 0 AFTER `customer_category`")
                        conn.commit()
                        # Calculate points for existing customers: 1 point per 10 INR spent
                        cursor.execute("UPDATE customers SET loyalty_points = CAST(total_amount_spent * 0.1 AS UNSIGNED)")
                        conn.commit()
                except Exception:
                    pass
            cursor.close()
            conn.close()
    except Exception as e:
        db_error = f"Database Connection Failed: {str(e)}"
    return db_initialized, db_error

# Load settings from Database
def load_settings():
    settings = {
        'smtp_host': 'smtp.gmail.com',
        'smtp_port': 587,
        'smtp_secure': 'tls',
        'smtp_user': 'dine09663@gmail.com',
        'smtp_pass': 'pwmnkucwvrkjvqql',
        'sms_provider': 'sms_gateway',
        'sms_host': 'us-central1-sms-gateway-ae7e1.cloudfunctions.net',
        'sms_token': 'xKr0nTsYhWVyam2H5kOCAcQDF83gwJPM1tNjLGq7EfR9XobB6SwZgsNrJTfdOYWzAuh6BveimURoD790',
        'sms_sender': '9026678700',
        'whatsapp_provider': 'simulated',
        'whatsapp_host': '',
        'whatsapp_token': '',
        'whatsapp_sender': '',
        'custom_bday_msg': "Dear {name},\n\nWe at Smart Dining Restaurant wish you a very Happy Birthday! Enjoy a complimentary dessert and 15% off on your next visit with us. Use code BDAY15.\n\nWarm regards,\nSmart Dining Team",
        'custom_anniv_msg': "Dear {name},\n\nHappy Anniversary to you and your partner from all of us at Smart Dining Restaurant! Celebrate your special day at our restaurant and receive a complimentary bottle of sparkling mocktails.\n\nWarm regards,\nSmart Dining Team"
    }
    
    db_initialized, _ = check_db_status()
    if db_initialized:
        try:
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT setting_key, setting_value FROM system_settings")
            for row in cursor.fetchall():
                key = row['setting_key']
                val = row['setting_value']
                if key in settings:
                    if key == 'smtp_port':
                        try:
                            settings[key] = int(val)
                        except ValueError:
                            pass
                    else:
                        settings[key] = val
            cursor.close()
            conn.close()
        except Exception:
            pass
    return settings

# Helper: Serialize query rows to JSON-compatible structures
def serialize_row(row):
    if not row:
        return row
    new_row = {}
    for k, v in row.items():
        if isinstance(v, (datetime.date, datetime.datetime)):
            new_row[k] = v.isoformat()
        elif isinstance(v, Decimal):
            new_row[k] = float(v)
        else:
            new_row[k] = v
    return new_row

def serialize_rows(rows):
    return [serialize_row(r) for r in rows]

# Socket/smtplib-based SMTP mail client
def send_smtp_email(to, subject, body, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure='tls'):
    msg = MIMEText(body, 'plain', 'utf-8')
    msg['Subject'] = Header(subject, 'utf-8')
    msg['From'] = Header(f"Smart Dining CRM <{smtp_user}>" if smtp_user else "Smart Dining CRM <noreply@smartdining.com>")
    msg['To'] = to
    
    timeout = 10
    if smtp_secure == 'ssl':
        server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=timeout)
    else:
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=timeout)
        if smtp_secure == 'tls':
            server.starttls()
            
    if smtp_user and smtp_pass:
        server.login(smtp_user, smtp_pass)
        
    server.sendmail(smtp_user if smtp_user else 'noreply@smartdining.com', [to], msg.as_string())
    server.quit()
    return True

# Phone normalizer to E.164
def normalize_phone_e164(phone):
    digits = ''.join(c for c in phone if c.isdigit())
    if len(digits) == 12 and digits.startswith('91'):
        return '+' + digits
    if len(digits) == 10:
        return '+91' + digits
    if phone.strip().startswith('+'):
        return '+' + digits
    return '+' + digits

# SMS Gateway Send client
def send_sms_gateway(to, message, sms_provider, sms_host, sms_token, sms_sender):
    if not to:
        raise Exception("Recipient phone number is empty.")
    
    if sms_provider == 'simulated':
        return {'status': 'Delivered', 'info': 'Simulated message logged (no real SMS sent).'}
        
    if sms_provider == 'twilio':
        # sms_host stores Account SID, sms_token stores Auth Token, sms_sender stores Twilio Phone Number or Messaging Service SID
        account_sid = sms_host.strip()
        auth_token = sms_token.strip()
        from_number = sms_sender.strip()
        
        if not account_sid.startswith('AC'):
            raise Exception("Invalid Twilio Account SID format. It must start with 'AC'.")
        if not auth_token:
            raise Exception("Twilio Auth Token is required.")
        if not from_number:
            raise Exception("Twilio Phone Number (Sender) or Messaging Service SID is required.")
            
        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
        
        payload = {
            'To': normalize_phone_e164(to),
            'Body': message
        }
        if from_number.startswith('MG'):
            payload['MessagingServiceSid'] = from_number
        else:
            payload['From'] = from_number
            
        import urllib.parse
        data = urllib.parse.urlencode(payload).encode('utf-8')
        
        auth_str = f"{account_sid}:{auth_token}"
        import base64
        auth_b64 = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
        
        req = urllib.request.Request(url, data=data, method='POST')
        req.add_header('Authorization', f"Basic {auth_b64}")
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
        
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                http_code = response.getcode()
                res_body = response.read().decode('utf-8')
                res_data = json.loads(res_body)
                if http_code == 201 or http_code == 200:
                    return {'status': 'Delivered', 'info': f"Twilio Message SID: {res_data.get('sid')}"}
                else:
                    raise Exception(f"Twilio error: {res_body}")
        except urllib.error.HTTPError as e:
            res_body = e.read().decode('utf-8')
            try:
                res_data = json.loads(res_body)
                err_msg = res_data.get('message') or res_body
            except Exception:
                err_msg = res_body or str(e)
            raise Exception(f"Twilio API returned HTTP {e.code}: {err_msg}")
        except Exception as e:
            raise Exception(f"Error sending SMS via Twilio: {str(e)}")
            
    if sms_provider == 'fast2sms':
        # Fast2SMS API Key is stored in sms_token
        # Extract 10 digits for Indian SMS
        digits = ''.join(c for c in to if c.isdigit())
        if len(digits) >= 10:
            raw_number = digits[-10:]
        else:
            raw_number = digits
            
        api_key = sms_token.strip()
        if not api_key:
            raise Exception("Fast2SMS API authorization key is required.")
            
        url = "https://www.fast2sms.com/dev/bulkV2"
        
        payload = {
            'route': 'q',
            'message': message,
            'language': 'english',
            'numbers': raw_number
        }
        if sms_sender and sms_sender.strip():
            payload['sender_id'] = sms_sender.strip()
            
        import urllib.parse
        data = urllib.parse.urlencode(payload).encode('utf-8')
        
        req = urllib.request.Request(url, data=data, method='POST')
        req.add_header('authorization', api_key)
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
        req.add_header('Cache-Control', 'no-cache')
        
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                http_code = response.getcode()
                res_body = response.read().decode('utf-8')
                res_data = json.loads(res_body)
                if http_code == 200 and res_data.get('return'):
                    info = res_data.get('message', ['Sent successfully'])[0]
                    return {'status': 'Delivered', 'info': info}
                else:
                    err_msg = res_data.get('message') or res_body
                    raise Exception(f"Fast2SMS error: {err_msg}")
        except urllib.error.HTTPError as e:
            res_body = e.read().decode('utf-8')
            try:
                res_data = json.loads(res_body)
                err_msg = res_data.get('message') or res_body
            except Exception:
                err_msg = res_body or str(e)
            raise Exception(f"Fast2SMS API returned HTTP {e.code}: {err_msg}")
        except Exception as e:
            raise Exception(f"Error sending SMS via Fast2SMS: {str(e)}")
    
    if sms_provider == 'sms_gateway':
        phone_e164 = normalize_phone_e164(to)
        gateway_url = 'https://us-central1-sms-gateway-ae7e1.cloudfunctions.net/api_sms_send'
        api_key = sms_token if sms_token else 'your_api_token_here'
        
        payload = {
            'phoneNumber': phone_e164,
            'message': message
        }
        
        headers = {
            'Content-Type': 'application/json',
            'X-API-Key': api_key
        }
        
        req = urllib.request.Request(
            gateway_url,
            data=json.dumps(payload).encode('utf-8'),
            headers=headers,
            method='POST'
        )
        
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                http_code = response.getcode()
                res_body = response.read().decode('utf-8')
                res_data = json.loads(res_body)
                
                if http_code == 200 and not res_data.get('error'):
                    info = res_data.get('message', 'SMS dispatched via Cloud Gateway.')
                    return {'status': 'Delivered', 'info': info}
                else:
                    err_msg = res_data.get('error') or res_data.get('message') or res_body
                    raise Exception(f"SMS Gateway returned HTTP {http_code}: {err_msg}")
        except urllib.error.HTTPError as e:
            res_body = e.read().decode('utf-8')
            try:
                res_data = json.loads(res_body)
                err_msg = res_data.get('error') or res_data.get('message') or res_body
            except Exception:
                err_msg = res_body or str(e)
            raise Exception(f"SMS Gateway returned HTTP {e.code}: {err_msg}")
        except Exception as e:
            raise Exception(f"Error sending SMS: {str(e)}")
            
    raise Exception(f"Unsupported SMS Provider: {sms_provider}")

# WhatsApp Gateway Send client
def send_whatsapp_gateway(to, message, whatsapp_provider, whatsapp_host, whatsapp_token, whatsapp_sender):
    if not to:
        raise Exception("Recipient phone number is empty.")
    
    if whatsapp_provider == 'simulated':
        return {'status': 'Delivered', 'info': 'Simulated WhatsApp message logged (no real WhatsApp sent).'}
        
    if whatsapp_provider == 'twilio':
        # Account SID, Auth Token, Sender number from WhatsApp configurations
        account_sid = whatsapp_host.strip()
        auth_token = whatsapp_token.strip()
        from_number = whatsapp_sender.strip()
        
        if not account_sid.startswith('AC'):
            raise Exception("Invalid Twilio Account SID format. It must start with 'AC'.")
        if not auth_token:
            raise Exception("Twilio Auth Token is required.")
        if not from_number:
            raise Exception("Twilio WhatsApp Number (Sender) is required.")
            
        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
        
        to_number = normalize_phone_e164(to)
        if not to_number.startswith('whatsapp:'):
            to_number = f"whatsapp:{to_number}"
            
        from_whatsapp = from_number
        if not from_whatsapp.startswith('whatsapp:'):
            from_whatsapp = f"whatsapp:{from_whatsapp}"
            
        payload = {
            'To': to_number,
            'From': from_whatsapp,
            'Body': message
        }
            
        import urllib.parse
        data = urllib.parse.urlencode(payload).encode('utf-8')
        
        auth_str = f"{account_sid}:{auth_token}"
        import base64
        auth_b64 = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
        
        req = urllib.request.Request(url, data=data, method='POST')
        req.add_header('Authorization', f"Basic {auth_b64}")
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
        
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                http_code = response.getcode()
                res_body = response.read().decode('utf-8')
                res_data = json.loads(res_body)
                if http_code == 201 or http_code == 200:
                    return {'status': 'Delivered', 'info': f"Twilio WhatsApp SID: {res_data.get('sid')}"}
                else:
                    raise Exception(f"Twilio error: {res_body}")
        except urllib.error.HTTPError as e:
            res_body = e.read().decode('utf-8')
            try:
                res_data = json.loads(res_body)
                err_msg = res_data.get('message') or res_body
            except Exception:
                err_msg = res_body or str(e)
            raise Exception(f"Twilio API returned HTTP {e.code}: {err_msg}")
        except Exception as e:
            raise Exception(f"Error sending WhatsApp via Twilio: {str(e)}")
            
    # Real WhatsApp API Integration can be added here.
    
    raise Exception(f"Unsupported WhatsApp Provider: {whatsapp_provider}")

# Root Route Handler: Handles Main rendering, Form POSTs and AJAX Actions
@app.route('/', methods=['GET', 'POST'])
def index():
    db_initialized, db_error = check_db_status()
    settings = load_settings()
    
    # -------------------------------------------------------------------------
    # 1. AJAX API GET ENDPOINTS
    # -------------------------------------------------------------------------
    action = request.args.get('action')
    if action:
        if action == 'send_test_sms' and db_initialized:
            test_phone = request.args.get('phone', '').strip()
            test_provider = request.args.get('provider', settings['sms_provider']).strip()
            test_host = request.args.get('host', settings['sms_host']).strip()
            test_api_key = request.args.get('api_key', '').strip() or settings['sms_token']
            test_sender = request.args.get('sender', settings['sms_sender']).strip()
            test_msg = request.args.get('message', '[Smart Dining CRM] Test SMS.').strip()
            
            if not test_phone:
                return jsonify({'success': False, 'message': 'Phone number is required.'})
            
            try:
                res = send_sms_gateway(test_phone, test_msg, test_provider, test_host, test_api_key, test_sender)
                return jsonify({'success': True, 'info': res.get('info', 'Sent'), 'status': res['status']})
            except Exception as e:
                return jsonify({'success': False, 'message': str(e)})
                
        elif action == 'send_test_email' and db_initialized:
            test_email = request.args.get('email', '').strip()
            test_msg = request.args.get('message', '[Smart Dining CRM] Test Email.').strip()
            subject = "[Smart Dining CRM] Test Email ✉️"
            
            if not test_email:
                return jsonify({'success': False, 'message': 'Email address is required.'})
            
            try:
                send_smtp_email(
                    test_email, subject, test_msg,
                    settings['smtp_host'], settings['smtp_port'],
                    settings['smtp_user'], settings['smtp_pass'],
                    settings['smtp_secure']
                )
                return jsonify({'success': True, 'info': 'Test Email sent successfully'})
            except Exception as e:
                return jsonify({'success': False, 'message': str(e)})
                
        elif action == 'send_test_whatsapp' and db_initialized:
            test_phone = request.args.get('phone', '').strip()
            test_provider = request.args.get('provider', settings['whatsapp_provider']).strip()
            test_host = request.args.get('host', settings['whatsapp_host']).strip()
            test_api_key = request.args.get('api_key', '').strip() or settings['whatsapp_token']
            test_sender = request.args.get('sender', settings['whatsapp_sender']).strip()
            test_msg = request.args.get('message', '[Smart Dining CRM] Test WhatsApp.').strip()
            
            if not test_phone:
                return jsonify({'success': False, 'message': 'Phone number is required.'})
            
            try:
                res = send_whatsapp_gateway(test_phone, test_msg, test_provider, test_host, test_api_key, test_sender)
                return jsonify({'success': True, 'info': res.get('info', 'Sent'), 'status': res['status']})
            except Exception as e:
                return jsonify({'success': False, 'message': str(e)})
                
        elif action == 'save_settings' and request.method == 'POST':
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                keys = [
                    'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass',
                    'sms_provider', 'sms_host', 'sms_token', 'sms_sender',
                    'whatsapp_provider', 'whatsapp_host', 'whatsapp_token', 'whatsapp_sender',
                    'custom_bday_msg', 'custom_anniv_msg'
                ]
                for k in keys:
                    val = request.form.get(k)
                    if val is not None:
                        cursor.execute(
                            "INSERT INTO system_settings (setting_key, setting_value) VALUES (%s, %s) "
                            "ON DUPLICATE KEY UPDATE setting_value = %s",
                            (k, val, val)
                        )
                conn.commit()
                cursor.close()
                conn.close()
                return jsonify({'success': True})
            except Exception as e:
                return jsonify({'success': False, 'message': str(e)})
                
        elif action == 'get_customer_details' and db_initialized:
            customer_id = request.args.get('id', type=int)
            if not customer_id:
                return jsonify({'success': False, 'message': 'Missing customer id'})
            try:
                conn = get_db_connection()
                cursor = conn.cursor(dictionary=True)
                
                # Fetch profile
                cursor.execute("SELECT * FROM customers WHERE customer_id = %s", (customer_id,))
                profile = cursor.fetchone()
                if not profile:
                    cursor.close()
                    conn.close()
                    return jsonify({'success': False, 'message': 'Customer not found'})
                    
                # Fetch preferences
                cursor.execute("SELECT * FROM customer_preferences WHERE customer_id = %s", (customer_id,))
                preferences = cursor.fetchone()
                
                # Fetch family members
                cursor.execute("SELECT * FROM family_members WHERE customer_id = %s", (customer_id,))
                family = cursor.fetchall()
                
                # Fetch special occasions
                cursor.execute("SELECT * FROM special_occasions WHERE customer_id = %s", (customer_id,))
                occasions = cursor.fetchall()
                
                # Fetch visits
                cursor.execute("SELECT * FROM restaurant_visits WHERE customer_id = %s ORDER BY visit_date DESC", (customer_id,))
                visits = cursor.fetchall()
                
                cursor.close()
                conn.close()
                
                return jsonify({
                    'success': True,
                    'profile': serialize_row(profile),
                    'preferences': serialize_row(preferences),
                    'family': serialize_rows(family),
                    'occasions': serialize_rows(occasions),
                    'visits': serialize_rows(visits)
                })
            except Exception as e:
                return jsonify({'success': False, 'message': str(e)})
                
        elif action == 'check_calendar_occasions' and db_initialized:
            date_str = request.args.get('date')
            if not date_str:
                return jsonify({'success': False, 'message': 'Missing date'})
            try:
                date_val = datetime.datetime.strptime(date_str, '%Y-%m-%d')
                month = date_val.month
                day = date_val.day
                
                conn = get_db_connection()
                cursor = conn.cursor(dictionary=True)
                
                # Fetch customer birthdays
                cursor.execute("SELECT customer_id, full_name, email_address, phone_number, date_of_birth FROM customers WHERE MONTH(date_of_birth) = %s AND DAY(date_of_birth) = %s", (month, day))
                birthdays = cursor.fetchall()
                
                # Fetch customer anniversaries
                cursor.execute("SELECT customer_id, full_name, email_address, phone_number, anniversary_date FROM customers WHERE MONTH(anniversary_date) = %s AND DAY(anniversary_date) = %s", (month, day))
                anniversaries = cursor.fetchall()
                
                # Fetch special occasions
                cursor.execute(
                    "SELECT o.*, c.full_name, c.email_address, c.phone_number "
                    "FROM special_occasions o "
                    "JOIN customers c ON o.customer_id = c.customer_id "
                    "WHERE MONTH(o.occasion_date) = %s AND DAY(o.occasion_date) = %s",
                    (month, day)
                )
                occasions = cursor.fetchall()
                
                # Family birthdays
                cursor.execute(
                    "SELECT f.customer_id, f.family_member_name, f.relationship, c.full_name, c.email_address, c.phone_number "
                    "FROM family_members f "
                    "JOIN customers c ON f.customer_id = c.customer_id "
                    "WHERE MONTH(f.date_of_birth) = %s AND DAY(f.date_of_birth) = %s",
                    (month, day)
                )
                fam_birthdays = cursor.fetchall()
                
                # Family anniversaries
                cursor.execute(
                    "SELECT f.customer_id, f.family_member_name, f.relationship, c.full_name, c.email_address, c.phone_number "
                    "FROM family_members f "
                    "JOIN customers c ON f.customer_id = c.customer_id "
                    "WHERE MONTH(f.anniversary_date) = %s AND DAY(f.anniversary_date) = %s",
                    (month, day)
                )
                fam_anniversaries = cursor.fetchall()
                
                cursor.close()
                conn.close()
                
                # Format family milestones
                for fb in fam_birthdays:
                    occasions.append({
                        'customer_id': fb['customer_id'],
                        'occasion_name': f"Family: {fb['family_member_name']}'s Birthday",
                        'occasion_type': fb['relationship'],
                        'occasion_date': date_str,
                        'full_name': fb['full_name'],
                        'email_address': fb['email_address'],
                        'phone_number': fb['phone_number']
                    })
                    
                for fa in fam_anniversaries:
                    occasions.append({
                        'customer_id': fa['customer_id'],
                        'occasion_name': f"Family: {fa['family_member_name']}'s Anniversary",
                        'occasion_type': fa['relationship'],
                        'occasion_date': date_str,
                        'full_name': fa['full_name'],
                        'email_address': fa['email_address'],
                        'phone_number': fa['phone_number']
                    })
                    
                return jsonify({
                    'success': True,
                    'date': date_str,
                    'birthdays': serialize_rows(birthdays),
                    'anniversaries': serialize_rows(anniversaries),
                    'occasions': serialize_rows(occasions)
                })
            except Exception as e:
                return jsonify({'success': False, 'message': str(e)})
                
        elif action == 'send_occasion_emails' and db_initialized:
            date_str = request.args.get('date')
            customer_ids_str = request.args.get('customer_ids', '')
            override_email = request.args.get('override_email', '').strip()
            override_phone = request.args.get('override_phone', '').strip()
            
            bday_msg_input = request.args.get('bday_msg', '').strip()
            anniv_msg_input = request.args.get('anniv_msg', '').strip()
            
            # Channel options (Direct UI parameters)
            send_email_opt = request.args.get('send_email', '1') == '1'
            send_sms_opt = request.args.get('send_sms', '1') == '1'
            send_whatsapp_opt = request.args.get('send_whatsapp', '1') == '1'
            
            bday_msg_template = bday_msg_input if bday_msg_input else settings['custom_bday_msg']
            anniv_msg_template = anniv_msg_input if anniv_msg_input else settings['custom_anniv_msg']
            
            if not customer_ids_str:
                return jsonify({'success': True, 'logs': []})
                
            try:
                customer_ids = [int(i) for i in customer_ids_str.split(',') if i.strip()]
                if not customer_ids:
                    return jsonify({'success': True, 'logs': []})
                    
                conn = get_db_connection()
                cursor = conn.cursor(dictionary=True)
                
                # Query customers
                in_placeholders = ', '.join(['%s'] * len(customer_ids))
                cursor.execute(f"SELECT customer_id, full_name, email_address, phone_number, preferred_channel, date_of_birth, anniversary_date FROM customers WHERE customer_id IN ({in_placeholders})", tuple(customer_ids))
                selected_customers = cursor.fetchall()
                
                date_val = datetime.datetime.strptime(date_str, '%Y-%m-%d')
                month = date_val.month
                day = date_val.day
                
                sent_logs = []
                
                for c in selected_customers:
                    is_bday = False
                    is_anniv = False
                    
                    if c.get('date_of_birth'):
                        dob_d = c['date_of_birth']
                        if dob_d.month == month and dob_d.day == day:
                            is_bday = True
                            
                    if c.get('anniversary_date'):
                        ann_d = c['anniversary_date']
                        if ann_d.month == month and ann_d.day == day:
                            is_anniv = True
                            
                    # Query family members
                    cursor.execute("SELECT family_member_name, relationship, date_of_birth, anniversary_date FROM family_members WHERE customer_id = %s", (c['customer_id'],))
                    family_members = cursor.fetchall()
                    
                    family_bday_name = None
                    family_anniv_name = None
                    
                    for fm in family_members:
                        if fm.get('date_of_birth'):
                            fdob = fm['date_of_birth']
                            if fdob.month == month and fdob.day == day:
                                family_bday_name = f"{fm['family_member_name']} ({fm['relationship']})"
                                break
                        if fm.get('anniversary_date'):
                            fann = fm['anniversary_date']
                            if fann.month == month and fann.day == day:
                                family_anniv_name = f"{fm['family_member_name']} ({fm['relationship']})"
                                break
                                
                    if is_bday or is_anniv or family_bday_name or family_anniv_name:
                        # Determine message subjects & templates
                        if is_bday:
                            subject = f"Happy Birthday, {c['full_name']}! 🎂"
                            template = bday_msg_template
                            log_type = 'Birthday'
                        elif is_anniv:
                            subject = f"Happy Anniversary, {c['full_name']}! 🥂"
                            template = anniv_msg_template
                            log_type = 'Anniversary'
                        elif family_bday_name:
                            subject = f"Happy Birthday to {family_bday_name}! 🎉"
                            template = "Dear {name},\n\nWe wish a very Happy Birthday to your family member, {family_name}! Have a wonderful celebration. Enjoy 10% off on your next dining visit. Use code FAMBDAY10.\n\nWarm regards,\nSmart Dining Team"
                            log_type = 'Family Birthday'
                        else:
                            subject = f"Happy Anniversary to {family_anniv_name}! 💕"
                            template = "Dear {name},\n\nHappy Anniversary to your family member, {family_name}! Celebrate this beautiful milestone with us. Enjoy a complimentary appetizer or dessert on your visit.\n\nWarm regards,\nSmart Dining Team"
                            log_type = 'Family Anniversary'
                            
                        message_body = template.replace('{name}', c['full_name'])
                        if family_bday_name:
                            message_body = message_body.replace('{family_name}', family_bday_name)
                        if family_anniv_name:
                            message_body = message_body.replace('{family_name}', family_anniv_name)
                        
                        db_occasion = 'Birthday' if 'Birthday' in log_type else 'Anniversary'
                            
                        # Send based on selected checkboxes (direct channels override preferred_channel defaults)
                        # Option 1: Send via Email if selected
                        if send_email_opt:
                            email_to = override_email if override_email else c['email_address']
                            if not email_to:
                                status = 'Failed'
                                dispatch_error = "No email address available."
                            else:
                                try:
                                    send_smtp_email(
                                        email_to, subject, message_body,
                                        settings['smtp_host'], settings['smtp_port'],
                                        settings['smtp_user'], settings['smtp_pass'],
                                        settings['smtp_secure']
                                    )
                                    status = 'Delivered'
                                    dispatch_error = None
                                except Exception as mail_ex:
                                    status = 'Failed'
                                    dispatch_error = str(mail_ex)
                                    
                            cursor.execute(
                                "INSERT INTO message_history (customer_id, message_channel, message_content, sent_datetime, delivery_status, occasion) "
                                "VALUES (%s, %s, %s, NOW(), %s, %s)",
                                (c['customer_id'], 'Email', f"Subject: {subject}\n\n{message_body}", status, db_occasion)
                            )
                            conn.commit()
                            
                            sent_logs.append({
                                'name': c['full_name'],
                                'type': log_type,
                                'to': email_to or '',
                                'status': status,
                                'error': dispatch_error,
                                'channel': 'Email'
                            })
                            
                        # Option 2: Send via SMS if selected
                        if send_sms_opt:
                            phone_to = override_phone if override_phone else c['phone_number']
                            if not phone_to:
                                status = 'Failed'
                                dispatch_error = "No phone number available."
                            else:
                                try:
                                    sms_res = send_sms_gateway(
                                        phone_to, message_body,
                                        settings['sms_provider'], settings['sms_host'],
                                        settings['sms_token'], settings['sms_sender']
                                    )
                                    status = sms_res['status']
                                    dispatch_error = sms_res.get('info')
                                except Exception as sms_ex:
                                    status = 'Failed'
                                    dispatch_error = str(sms_ex)
                                    
                            cursor.execute(
                                "INSERT INTO message_history (customer_id, message_channel, message_content, sent_datetime, delivery_status, occasion) "
                                "VALUES (%s, %s, %s, NOW(), %s, %s)",
                                (c['customer_id'], 'SMS', f"Subject: {subject}\n\n{message_body}", status, db_occasion)
                            )
                            conn.commit()
                            
                            sent_logs.append({
                                'name': c['full_name'],
                                'type': log_type,
                                'to': phone_to or '',
                                'status': status,
                                'error': dispatch_error,
                                'channel': 'SMS'
                            })
                            
                        # Option 3: Send via WhatsApp if selected
                        if send_whatsapp_opt:
                            phone_to = override_phone if override_phone else c['phone_number']
                            if not phone_to:
                                status = 'Failed'
                                dispatch_error = "No phone number available."
                            else:
                                try:
                                    wa_res = send_whatsapp_gateway(
                                        phone_to, message_body,
                                        settings['whatsapp_provider'], settings['whatsapp_host'],
                                        settings['whatsapp_token'], settings['whatsapp_sender']
                                    )
                                    status = wa_res['status']
                                    dispatch_error = wa_res.get('info')
                                except Exception as wa_ex:
                                    status = 'Failed'
                                    dispatch_error = str(wa_ex)
                                    
                            cursor.execute(
                                "INSERT INTO message_history (customer_id, message_channel, message_content, sent_datetime, delivery_status, occasion) "
                                "VALUES (%s, %s, %s, NOW(), %s, %s)",
                                (c['customer_id'], 'WhatsApp', f"Subject: {subject}\n\n{message_body}", status, db_occasion)
                            )
                            conn.commit()
                            
                            sent_logs.append({
                                'name': c['full_name'],
                                'type': log_type,
                                'to': phone_to or '',
                                'status': status,
                                'error': dispatch_error,
                                'channel': 'WhatsApp'
                            })
                            
                cursor.close()
                conn.close()
                return jsonify({'success': True, 'logs': sent_logs})
            except Exception as e:
                return jsonify({'success': False, 'message': str(e)})
                
        elif action == 'send_offline_message' and db_initialized:
            customer_id = request.args.get('customer_id', type=int)
            channel = request.args.get('channel', '').strip()
            content = request.args.get('content', '').strip()
            subject = request.args.get('subject', '').strip()
            
            if not customer_id:
                return jsonify({'success': False, 'message': 'Customer ID is required.'})
            if not channel or channel not in ['Email', 'SMS', 'WhatsApp']:
                return jsonify({'success': False, 'message': 'Valid channel is required.'})
            if not content:
                return jsonify({'success': False, 'message': 'Message content is required.'})
                
            full_msg = f"Subject: {subject}\n\n{content}" if (channel == 'Email' and subject) else content
            
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO message_history (customer_id, message_channel, message_content, sent_datetime, delivery_status, delivery_type) "
                    "VALUES (%s, %s, %s, NOW(), 'Delivered', 'Manual')",
                    (customer_id, channel, full_msg)
                )
                conn.commit()
                message_id = cursor.lastrowid
                
                # Fetch customer name to return in log response
                cursor.execute("SELECT full_name FROM customers WHERE customer_id = %s", (customer_id,))
                cust = cursor.fetchone()
                cust_name = cust[0] if cust else "Unknown"
                
                cursor.close()
                conn.close()
                
                return jsonify({
                    'success': True,
                    'log': {
                        'message_id': message_id,
                        'full_name': cust_name,
                        'message_channel': channel,
                        'message_content': full_msg,
                        'sent_datetime': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        'delivery_status': 'Delivered',
                        'delivery_type': 'Manual'
                    }
                })
            except Exception as e:
                return jsonify({'success': False, 'message': str(e)})
                
    # -------------------------------------------------------------------------
    # 2. MAIN POST FORM SUBMISSIONS
    # -------------------------------------------------------------------------
    success_message = None
    error_message = None
    
    if request.method == 'POST':
        # Action: Initialize DB
        if 'initialize_db' in request.form:
            sql_file_path = os.path.join(app.root_path, 'smart_dining_crm.sql')
            if os.path.exists(sql_file_path):
                try:
                    conn = get_db_connection(select_db=False)
                    cursor = conn.cursor()
                    
                    with open(sql_file_path, 'r', encoding='utf-8') as f:
                        sql_content = f.read()
                        
                    # Split statements by semicolon and run sequentially
                    statements = sql_content.split(';')
                    for stmt in statements:
                        clean_stmt = stmt.strip()
                        if clean_stmt:
                            cursor.execute(clean_stmt)
                            
                    conn.commit()
                    cursor.close()
                    conn.close()
                    
                    db_initialized = True
                    success_message = "Database configured successfully! All updates saved."
                except Exception as e:
                    error_message = f"Failed to run schema script: {str(e)}"
            else:
                error_message = "Initialization error: 'smart_dining_crm.sql' file not found."
                
        # Action: Record Dining Visit
        elif 'add_visit' in request.form and db_initialized:
            try:
                c_id = int(request.form.get('customer_id'))
                visit_date = request.form.get('visit_date')
                visit_time = request.form.get('visit_time')
                guests = int(request.form.get('guests', 1))
                bill = float(request.form.get('bill', 0.0))
                rating_val = request.form.get('rating')
                rating = int(rating_val) if rating_val and rating_val.strip() else None
                comment = request.form.get('comment', '').strip()
                
                visit_datetime = f"{visit_date} {visit_time}"
                
                conn = get_db_connection()
                cursor = conn.cursor(dictionary=True)
                
                # Insert visit
                cursor.execute(
                    "INSERT INTO restaurant_visits (customer_id, visit_date, number_of_guests, total_bill_amount, feedback_rating, feedback_comment) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (c_id, visit_datetime, guests, bill, rating, comment)
                )
                
                # Query totals
                cursor.execute(
                    "SELECT COUNT(*) as v_count, SUM(total_bill_amount) as total_spent, MAX(visit_date) as last_v "
                    "FROM restaurant_visits WHERE customer_id = %s", (c_id,)
                )
                totals = cursor.fetchone()
                
                # Categorize customer
                v_count = totals['v_count']
                total_spent = float(totals['total_spent'] or 0.0)
                last_v = totals['last_v']
                
                category = 'New'
                if total_spent >= 10000.0 or v_count >= 10:
                    category = 'VIP'
                elif total_spent >= 3000.0 or v_count >= 4:
                    category = 'Regular'
                    
                # Calculate loyalty points dynamically (1 point per 10 INR spent)
                loyalty_points = int(total_spent * 0.1)
                    
                # Update customer
                cursor.execute(
                    "UPDATE customers SET total_visits = %s, total_amount_spent = %s, last_visit_date = DATE(%s), customer_category = %s, loyalty_points = %s "
                    "WHERE customer_id = %s",
                    (v_count, total_spent, last_v, category, loyalty_points, c_id)
                )
                
                conn.commit()
                cursor.close()
                conn.close()
                success_message = "New visit logged! Total visits, spend, and category updated."
            except Exception as e:
                error_message = f"Error recording visit: {str(e)}"
                
        # Action: Register Customer Profile
        elif 'register_customer' in request.form and db_initialized:
            try:
                full_name = request.form.get('full_name', '').strip()
                phone = request.form.get('phone', '').strip()
                email = request.form.get('email', '').strip() or None
                gender = request.form.get('gender') or None
                dob = request.form.get('dob') or None
                anniversary = request.form.get('anniversary') or None
                address = request.form.get('address', '').strip() or None
                pref_channel = request.form.get('preferred_channel', 'WhatsApp')
                consent = request.form.get('consent', 'No')
                loyalty_points = int(request.form.get('loyalty_points', 0) or 0)
                reg_date = datetime.date.today().isoformat()
                
                conn = get_db_connection()
                cursor = conn.cursor()
                
                # Insert Customer
                cursor.execute(
                    "INSERT INTO customers (full_name, phone_number, email_address, gender, date_of_birth, anniversary_date, address, registration_date, customer_category, preferred_channel, marketing_consent, loyalty_points) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'New', %s, %s, %s)",
                    (full_name, phone, email, gender, dob, anniversary, address, reg_date, pref_channel, consent, loyalty_points)
                )
                new_customer_id = cursor.lastrowid
                
                # Initialize Preferences
                cursor.execute(
                    "INSERT INTO customer_preferences (customer_id, dietary_preference, spice_preference, preferred_seating) "
                    "VALUES (%s, 'Non-Veg', 'Medium', 'No Preference')", (new_customer_id,)
                )
                
                # Insert Family Members
                family_names = request.form.getlist('family_name[]')
                family_relationships = request.form.getlist('family_relationship[]')
                family_dobs = request.form.getlist('family_dob[]')
                family_anniversaries = request.form.getlist('family_anniversary[]')
                
                for i in range(len(family_names)):
                    name = family_names[i].strip()
                    if not name:
                        continue
                    relationship = family_relationships[i].strip() if i < len(family_relationships) else 'Other'
                    fdob = family_dobs[i] if (i < len(family_dobs) and family_dobs[i].strip()) else None
                    fann = family_anniversaries[i] if (i < len(family_anniversaries) and family_anniversaries[i].strip()) else None
                    
                    cursor.execute(
                        "INSERT INTO family_members (customer_id, family_member_name, relationship, date_of_birth, anniversary_date) "
                        "VALUES (%s, %s, %s, %s, %s)",
                        (new_customer_id, name, relationship, fdob, fann)
                    )
                    
                conn.commit()
                cursor.close()
                conn.close()
                success_message = f"Customer '{full_name}' registered successfully!"
            except Exception as e:
                error_message = f"Registration failed: {str(e)}"
                
        # Action: Edit Customer Profile
        elif 'edit_customer' in request.form and db_initialized:
            try:
                c_id = int(request.form.get('customer_id'))
                full_name = request.form.get('full_name', '').strip()
                phone = request.form.get('phone', '').strip()
                email = request.form.get('email', '').strip() or None
                gender = request.form.get('gender') or None
                dob = request.form.get('dob') or None
                anniversary = request.form.get('anniversary') or None
                address = request.form.get('address', '').strip() or None
                pref_channel = request.form.get('preferred_channel', 'WhatsApp')
                consent = request.form.get('consent', 'No')
                loyalty_points = int(request.form.get('loyalty_points', 0) or 0)
                
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute(
                    "UPDATE customers SET full_name = %s, phone_number = %s, email_address = %s, gender = %s, date_of_birth = %s, "
                    "anniversary_date = %s, address = %s, preferred_channel = %s, marketing_consent = %s, loyalty_points = %s WHERE customer_id = %s",
                    (full_name, phone, email, gender, dob, anniversary, address, pref_channel, consent, loyalty_points, c_id)
                )
                conn.commit()
                cursor.close()
                conn.close()
                success_message = f"Customer profile '{full_name}' updated successfully!"
            except Exception as e:
                error_message = f"Failed to update profile: {str(e)}"

    # -------------------------------------------------------------------------
    # 3. QUERY CORE DATA FOR DASHBOARD
    # -------------------------------------------------------------------------
    stats = {'customers': 0, 'spent': 0.00, 'visits': 0}
    customers = []
    top_customers = []
    recent_messages = []
    
    if db_initialized:
        try:
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            
            # Stats
            cursor.execute("SELECT COUNT(*) as c FROM customers")
            stats['customers'] = cursor.fetchone()['c']
            
            cursor.execute("SELECT SUM(total_amount_spent) as s FROM customers")
            stats['spent'] = cursor.fetchone()['s'] or 0.00
            
            cursor.execute("SELECT SUM(total_visits) as v FROM customers")
            stats['visits'] = cursor.fetchone()['v'] or 0
            
            # Customers Directory
            cursor.execute("SELECT * FROM customers ORDER BY registration_date DESC")
            customers = serialize_rows(cursor.fetchall())
            
            # Top 10 Customers with SMS, Email, WhatsApp counts
            cursor.execute(
                "SELECT c.*, "
                "       (SELECT COUNT(*) FROM message_history WHERE customer_id = c.customer_id AND message_channel = 'SMS') as sms_count, "
                "       (SELECT COUNT(*) FROM message_history WHERE customer_id = c.customer_id AND message_channel = 'WhatsApp') as whatsapp_count, "
                "       (SELECT COUNT(*) FROM message_history WHERE customer_id = c.customer_id AND message_channel = 'Email') as email_count "
                "FROM customers c "
                "ORDER BY c.loyalty_points DESC, c.total_amount_spent DESC "
                "LIMIT 10"
            )
            top_customers = serialize_rows(cursor.fetchall())
            
            # Message logs
            cursor.execute(
                "SELECT m.*, c.full_name "
                "FROM message_history m "
                "JOIN customers c ON m.customer_id = c.customer_id "
                "ORDER BY m.sent_datetime DESC LIMIT 50"
            )
            recent_messages = serialize_rows(cursor.fetchall())
            
            cursor.close()
            conn.close()
        except Exception as e:
            db_error = f"Retrieval query error: {str(e)}"
            
    # Load templates logic
    return render_template(
        'index.html',
        host='127.0.0.1',
        port=3306,
        dbname='smart_dining_crm',
        user='root',
        db_initialized=db_initialized,
        db_error=db_error,
        success_message=success_message,
        error_message=error_message,
        stats=stats,
        customers=customers,
        top_customers=top_customers,
        recent_messages=recent_messages,
        settings=settings,
        current_date=datetime.date.today().isoformat()
    )

if __name__ == '__main__':
    # Listen on localhost (127.0.0.1) on port 5000 (standard for Flask)
    app.run(host='127.0.0.1', port=5000, debug=True)
