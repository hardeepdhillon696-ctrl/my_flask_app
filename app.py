
import os
import re 
import secrets
import uuid
from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
from werkzeug.utils import secure_filename
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from functools import wraps
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadSignature


# ------------------------ PASSWORD VALIDATION ------------------------
def validate_password(password):
    """
    Validates a password:
    - Min 8 chars
    - At least 1 uppercase, 1 lowercase, 1 number, 1 special char
    Returns: (bool, message)
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."
    if not re.search(r"[0-9]", password):
        return False, "Password must contain at least one digit."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Password must contain at least one special character."
    return True, ""


# ------------------------ LOGIN REQUIRED DECORATOR ------------------------
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("user_id") or session.get("logged_out"):
            flash("⚠️ Please login to continue.", "warning")
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated_function


# ------------------------ APP SETUP ------------------------
app = Flask(__name__)
app.config['SECRET_KEY'] = 'replace_with_a_random_secret_key'

# PostgreSQL connection (Render provides DATABASE_URL)
db_url = os.environ.get("DATABASE_URL")
if db_url and db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

# Force SSL (Render requires this)
if db_url:
    db_url = db_url + "?sslmode=require"

app.config['SQLALCHEMY_DATABASE_URI'] = db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)



# ------------------------ MODELS ------------------------
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    bio = db.Column(db.String(300), default="I'm a gamer!")
    avatar = db.Column(db.String(200), default="default-avatar.png")
    xp = db.Column(db.Integer, default=0)

class Upload(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(200), nullable=False)
    filetype = db.Column(db.String(20), nullable=False)  # "image" or "video"
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('uploads', lazy=True))
    created_at = db.Column(db.DateTime, default=db.func.now())
    views = db.Column(db.Integer, default=0)
    likes = db.Column(db.Integer, default=0)

class VideoLike(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(200), nullable=False)  # username or anonymous session
    filename = db.Column(db.String(255), nullable=False)
    filetype = db.Column(db.String(20), nullable=False)
    video_id = db.Column(db.Integer, db.ForeignKey('upload.id'), nullable=False)
    video = db.relationship('Upload', backref=db.backref('video_likes', lazy=True))

class UploadView(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    upload_id = db.Column(db.Integer, db.ForeignKey('upload.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.now())

    # Optional: ensure unique combination
    __table_args__ = (db.UniqueConstraint('upload_id', 'user_id', name='unique_view'),)

# ------------------------ INIT DATABASE ------------------------
with app.app_context():
    db.create_all()


# ------------------------ FILE UPLOAD CONFIG ------------------------
UPLOAD_FOLDER = "static/uploads"
AVATAR_FOLDER = os.path.join(app.root_path, "static", "avatars")
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'mov', 'avi'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['AVATAR_FOLDER'] = AVATAR_FOLDER
app.config['ALLOWED_EXTENSIONS'] = ALLOWED_EXTENSIONS

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(AVATAR_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def allowed_avatar(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'png', 'jpg', 'jpeg', 'gif'}


# ------------------------ SESSION ID FOR ANONYMOUS USERS ------------------------
@app.before_request
def assign_session_id():
    if "session_id" not in session:
        session["session_id"] = str(uuid.uuid4())


# ------------------------ ROUTES ------------------------
@app.route('/')
def index():
    uploads = Upload.query.order_by(Upload.id.desc()).all()
    return render_template("index.html", uploads=uploads)


# ---------- LOGIN ----------
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return render_template("login.html")

    identifier = request.form.get("email") or request.form.get("username") or request.form.get("identifier")
    password = request.form.get("password", "")

    if not identifier:
        flash("Please enter your email or username.", "warning")
        return redirect(url_for("login"))

    identifier = identifier.strip()
    if "@" in identifier:
        user = User.query.filter_by(email=identifier.lower()).first()
    else:
        user = User.query.filter_by(username=identifier).first()

    if user and bcrypt.check_password_hash(user.password, password):
        # ✅ clear old session + set fresh values
        session.clear()
        session['user_id'] = user.id
        session['username'] = user.username
        session['email'] = user.email
        session['logged_out'] = False   # reset logout flag

        # flash(f"🎉 Welcome back, {user.username}!", "success")
        return redirect(url_for("dashboard"))

    flash("❌ Invalid email/username or password!", "danger")
    return redirect(url_for("login"))


# ---------- REGISTER ----------
@app.route('/register', methods=['POST'])
def register():
    username = request.form['username']
    email = request.form['email']
    password = request.form['password']

    existing_user = User.query.filter(
        (User.username == username) | (User.email == email)
    ).first()

    if existing_user:
        flash("❌ Username or email already taken. Please try again.", "danger")
        return redirect(url_for('login'))

    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    new_user = User(username=username, email=email, password=hashed_password)
    db.session.add(new_user)
    db.session.commit()

    flash("✅ Account created successfully! Please login.", "success")
    return redirect(url_for('login'))


# ---------- DASHBOARD ----------
@app.route("/dashboard")
@login_required
def dashboard():
    user = User.query.filter_by(email=session["email"]).first()
    if not user:
        flash("⚠ User not found!", "danger")
        return redirect(url_for("login"))

    uploads = Upload.query.filter_by(user_id=user.id).all()
    return render_template("dashboard.html", user=user, uploads=uploads)


# ---------- UPLOAD FILE ----------
@app.route('/upload', methods=['GET', 'POST'])
@login_required
def upload_file():
    user = User.query.filter_by(username=session["username"]).first()
    if request.method == 'POST':
        if 'file' not in request.files:
            flash('❌ No file part', "danger")
            return redirect(request.url)

        file = request.files['file']
        if file.filename == '':
            flash('❌ No selected file', "danger")
            return redirect(request.url)

        if file and allowed_file(file.filename):
            filename = f"{uuid.uuid4().hex}_{secure_filename(file.filename)}"
            save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(save_path)

            ext = filename.rsplit('.', 1)[1].lower()
            filetype = "video" if ext in ["mp4", "mov", "avi"] else "image"

            new_upload = Upload(filename=filename, filetype=filetype, user_id=user.id)
            db.session.add(new_upload)
            db.session.commit()

            # flash('✅ File uploaded to your profile!', "success")
            return redirect(url_for('dashboard'))
        else:
            flash('❌ Invalid file type!', "danger")
            return redirect(request.url)

    return render_template('upload.html')


# ---------- LOGOUT ----------
@app.route("/logout")
def logout():
    session["logged_out"] = True
    # flash("You have been logged out.", "info")
    return redirect(url_for("login"))


# ---------- PUBLIC VIDEO VIEW ----------
@app.route("/view/<int:upload_id>", methods=["GET"])
def view_upload(upload_id):
    upload = Upload.query.get_or_404(upload_id)
    return render_template("view.html", upload=upload)
from flask import session, jsonify

from flask import session, jsonify

@app.route("/view/<int:upload_id>", methods=["POST"])
def api_increment_view(upload_id):
    upload = Upload.query.get_or_404(upload_id)

    # Initialize session key if not present
    if "viewed_uploads" not in session:
        session["viewed_uploads"] = []

    viewed_uploads = session["viewed_uploads"]

    # Only count if this video hasn't been viewed in this session
    if upload_id not in viewed_uploads:
        upload.views += 1
        db.session.commit()

        # Add this video ID to session
        viewed_uploads.append(upload_id)
        session["viewed_uploads"] = viewed_uploads  # 🔑 reassign so it persists

    return jsonify({"views": upload.views})






# ---------- PUBLIC VIDEO LIKE ----------
@app.route("/like/<int:upload_id>", methods=["POST"])
def like_upload(upload_id):
    upload = Upload.query.get_or_404(upload_id)

    liked_videos = session.get("liked_videos", [])
    if upload.id in liked_videos:
        return jsonify({"error": "Already liked"}), 400

    upload.likes = (upload.likes or 0) + 1
    db.session.commit()

    liked_videos.append(upload.id)
    session["liked_videos"] = liked_videos

    return jsonify({"likes": upload.likes})


# ---------- GALLERY ----------
@app.route("/gallery")
def gallery():
    uploads = Upload.query.order_by(Upload.id.desc()).all()
    return render_template("gallery.html", uploads=uploads)


# ---------- USERS ----------
@app.route("/users")
def users():
    all_users = User.query.all()
    current_user = None
    username = session.get("username")
    if username:
        current_user = User.query.filter_by(username=username).first()
    return render_template("users.html", users=all_users, me=current_user)


@app.route('/delete_user/<int:user_id>', methods=['POST'])
def delete_user(user_id):
    user = User.query.get_or_404(user_id)
    db.session.delete(user)
    db.session.commit()
    return redirect(url_for('users'))


# ---------- PROFILE ----------
@app.route("/profile/<username>", methods=["GET", "POST"])
def profile(username):
    user = User.query.filter_by(username=username).first_or_404()

    if request.method == "POST":
        if "avatar" in request.files and request.files["avatar"].filename != "":
            avatar = request.files["avatar"]
            filename = secure_filename(avatar.filename)
            avatar_path = os.path.join(app.config["AVATAR_FOLDER"], filename)
            avatar.save(avatar_path)
            user.avatar = filename
            db.session.commit()
            flash("Avatar updated!", "success")
            return redirect(url_for("profile", username=user.username))

        if "bio" in request.form:
            user.bio = request.form["bio"]
            db.session.commit()
            flash("Bio updated!", "success")
            return redirect(url_for("profile", username=user.username))

    return render_template("profile.html", user=user)


# ---------- UPLOAD AVATAR ----------
@app.route("/upload_avatar", methods=["POST"])
@login_required
def upload_avatar():
    user = User.query.filter_by(username=session["username"]).first()
    file = request.files.get("avatar")
    if not file or file.filename == "":
        flash("No file selected!", "warning")
        return redirect(url_for("dashboard"))

    if file and allowed_avatar(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config["AVATAR_FOLDER"], filename)
        file.save(filepath)
        user.avatar = filename
        db.session.commit()
        flash("Profile picture updated!", "success")
    else:
        flash("Invalid file type. Please upload an image.", "danger")

    return redirect(url_for("dashboard"))


# ---------- CHANGE PASSWORD ----------
@app.route("/change_password", methods=["GET", "POST"])
@login_required
def change_password():
    user = User.query.filter_by(username=session["username"]).first()

    if request.method == "POST":
        current_password = request.form["current_password"]
        new_password = request.form["new_password"]

        is_valid, message = validate_password(new_password)
        if not is_valid:
            flash(f"❌ {message}", "danger")
            return redirect(url_for("change_password"))

        if bcrypt.check_password_hash(user.password, current_password):
            user.password = bcrypt.generate_password_hash(new_password).decode("utf-8")
            db.session.commit()
            flash("Password updated successfully!", "success")
            return redirect(url_for("profile", username=user.username))
        else:
            flash("❌ Wrong current password!", "danger")

    return render_template("change_password.html", user=user)


# ---------- CHANGE USERNAME ----------
@app.route("/change_username", methods=["GET", "POST"])
@login_required
def change_username():
    user = User.query.filter_by(username=session["username"]).first()

    if request.method == "POST":
        new_username = request.form["new_username"]

        if User.query.filter_by(username=new_username).first():
            flash("That username is already taken!", "error")
        else:
            user.username = new_username
            session["username"] = new_username
            db.session.commit()
            flash("Username updated successfully!", "success")
            return redirect(url_for("profile", username=new_username))

    return render_template("change_username.html", user=user)


# ------------------------ DISABLE BACK BUTTON CACHE ------------------------
@app.after_request
def add_header(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# ---------- DELETE UPLOAD ----------
@app.route("/delete/<int:upload_id>", methods=["POST"])
@login_required
def delete_upload(upload_id):
    upload = Upload.query.get_or_404(upload_id)
    user = User.query.filter_by(username=session["username"]).first()

    if upload.user_id != user.id:
        flash("❌ You are not allowed to delete this upload.", "danger")
        return redirect(url_for("dashboard"))

    file_path = os.path.join(app.root_path, "static", "uploads", upload.filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    db.session.delete(upload)
    db.session.commit()

    flash("✅ Upload deleted successfully.", "success")
    return redirect(url_for("dashboard"))


# ---------- FORGOT PASSWORD ----------
@app.route("/forgot_password", methods=["GET", "POST"])
def forgot_password():
    reset_link = None
    message = None
    if request.method == "POST":
        email = request.form.get("email")
        user = User.query.filter_by(email=email).first()
        if user:
            token = serializer.dumps(email, salt="password-reset-salt")
            reset_link = url_for("reset_password", token=token, _external=True)
            message = "✅ Reset link generated! Click below."
        else:
            message = "❌ Email not found."
    return render_template("forgot_password.html", reset_link=reset_link, message=message)


@app.route("/reset_password/<token>", methods=["GET", "POST"])
def reset_password(token):
    try:
        email = serializer.loads(token, salt="password-reset-salt", max_age=3600)
    except SignatureExpired:
        flash("⚠️ Token expired. Please request a new reset link.", "warning")
        return redirect(url_for("forgot_password"))
    except BadSignature:
        return redirect(url_for("forgot_password"))

    user = User.query.filter_by(email=email).first()
    if not user:
        flash("⚠️ User not found.", "danger")
        return redirect(url_for("forgot_password"))

    if request.method == "POST":
        new_password = request.form.get("password")
        is_valid, message = validate_password(new_password)
        if not is_valid:
            flash(f"❌ {message}", "danger")
            return redirect(url_for("reset_password", token=token))

        user.password = bcrypt.generate_password_hash(new_password).decode("utf-8")
        db.session.commit()
        flash("✅ Password reset successfully! Please login.", "success")
        return redirect(url_for("login"))

    return render_template("reset_password.html", email=email)


# ------------------------ RUN APP ------------------------
if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True)

import os
import re 
import uuid
from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
from werkzeug.utils import secure_filename
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from functools import wraps
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadSignature


# ------------------------ PASSWORD VALIDATION ------------------------
def validate_password(password):
    """
    Validates a password:
    - Min 8 chars
    - At least 1 uppercase, 1 lowercase, 1 number, 1 special char
    Returns: (bool, message)
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."
    if not re.search(r"[0-9]", password):
        return False, "Password must contain at least one digit."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return False, "Password must contain at least one special character."
    return True, ""


# ------------------------ LOGIN REQUIRED DECORATOR ------------------------
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("user_id") or session.get("logged_out"):
            flash("⚠️ Please login to continue.", "warning")
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated_function


# ------------------------ APP SETUP ------------------------
app = Flask(__name__)
app.config['SECRET_KEY'] = "replace_with_a_random_secret_key"
app.secret_key = app.config['SECRET_KEY']

# SQLite DB setup
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///users.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'])


# ------------------------ MODELS ------------------------
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    bio = db.Column(db.String(300), default="I'm a gamer!")
    avatar = db.Column(db.String(200), default="default-avatar.png")
    xp = db.Column(db.Integer, default=0)

class Upload(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(200), nullable=False)
    filetype = db.Column(db.String(20), nullable=False)  # "image" or "video"
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref=db.backref('uploads', lazy=True))
    created_at = db.Column(db.DateTime, default=db.func.now())
    views = db.Column(db.Integer, default=0)
    likes = db.Column(db.Integer, default=0)

class VideoLike(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(200), nullable=False)  # username or anonymous session
    filename = db.Column(db.String(255), nullable=False)
    filetype = db.Column(db.String(20), nullable=False)
    video_id = db.Column(db.Integer, db.ForeignKey('upload.id'), nullable=False)
    video = db.relationship('Upload', backref=db.backref('video_likes', lazy=True))

class UploadView(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    upload_id = db.Column(db.Integer, db.ForeignKey('upload.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.now())

    # Optional: ensure unique combination
    __table_args__ = (db.UniqueConstraint('upload_id', 'user_id', name='unique_view'),)

# ------------------------ INIT DATABASE ------------------------
with app.app_context():
    db.create_all()


# ------------------------ FILE UPLOAD CONFIG ------------------------
UPLOAD_FOLDER = "static/uploads"
AVATAR_FOLDER = os.path.join(app.root_path, "static", "avatars")
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'mov', 'avi'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['AVATAR_FOLDER'] = AVATAR_FOLDER
app.config['ALLOWED_EXTENSIONS'] = ALLOWED_EXTENSIONS

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(AVATAR_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def allowed_avatar(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'png', 'jpg', 'jpeg', 'gif'}


# ------------------------ SESSION ID FOR ANONYMOUS USERS ------------------------
@app.before_request
def assign_session_id():
    if "session_id" not in session:
        session["session_id"] = str(uuid.uuid4())


# ------------------------ ROUTES ------------------------
@app.route('/')
def index():
    uploads = Upload.query.order_by(Upload.id.desc()).all()
    return render_template("index.html", uploads=uploads)


# ---------- LOGIN ----------
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        return render_template("login.html")

    identifier = request.form.get("email") or request.form.get("username") or request.form.get("identifier")
    password = request.form.get("password", "")

    if not identifier:
        flash("Please enter your email or username.", "warning")
        return redirect(url_for("login"))

    identifier = identifier.strip()
    if "@" in identifier:
        user = User.query.filter_by(email=identifier.lower()).first()
    else:
        user = User.query.filter_by(username=identifier).first()

    if user and bcrypt.check_password_hash(user.password, password):
        # ✅ clear old session + set fresh values
        session.clear()
        session['user_id'] = user.id
        session['username'] = user.username
        session['email'] = user.email
        session['logged_out'] = False   # reset logout flag

        # flash(f"🎉 Welcome back, {user.username}!", "success")
        return redirect(url_for("dashboard"))

    flash("❌ Invalid email/username or password!", "danger")
    return redirect(url_for("login"))


# ---------- REGISTER ----------
@app.route('/register', methods=['POST'])
def register():
    username = request.form['username']
    email = request.form['email']
    password = request.form['password']

    existing_user = User.query.filter(
        (User.username == username) | (User.email == email)
    ).first()

    if existing_user:
        flash("❌ Username or email already taken. Please try again.", "danger")
        return redirect(url_for('login'))

    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    new_user = User(username=username, email=email, password=hashed_password)
    db.session.add(new_user)
    db.session.commit()

    flash("✅ Account created successfully! Please login.", "success")
    return redirect(url_for('login'))


# ---------- DASHBOARD ----------
@app.route("/dashboard")
@login_required
def dashboard():
    user = User.query.filter_by(email=session["email"]).first()
    if not user:
        flash("⚠ User not found!", "danger")
        return redirect(url_for("login"))

    uploads = Upload.query.filter_by(user_id=user.id).all()
    return render_template("dashboard.html", user=user, uploads=uploads)


# ---------- UPLOAD FILE ----------
@app.route('/upload', methods=['GET', 'POST'])
@login_required
def upload_file():
    user = User.query.filter_by(username=session["username"]).first()
    if request.method == 'POST':
        if 'file' not in request.files:
            flash('❌ No file part', "danger")
            return redirect(request.url)

        file = request.files['file']
        if file.filename == '':
            flash('❌ No selected file', "danger")
            return redirect(request.url)

        if file and allowed_file(file.filename):
            filename = f"{uuid.uuid4().hex}_{secure_filename(file.filename)}"
            save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(save_path)

            ext = filename.rsplit('.', 1)[1].lower()
            filetype = "video" if ext in ["mp4", "mov", "avi"] else "image"

            new_upload = Upload(filename=filename, filetype=filetype, user_id=user.id)
            db.session.add(new_upload)
            db.session.commit()

            # flash('✅ File uploaded to your profile!', "success")
            return redirect(url_for('dashboard'))
        else:
            flash('❌ Invalid file type!', "danger")
            return redirect(request.url)

    return render_template('upload.html')


# ---------- LOGOUT ----------
@app.route("/logout")
def logout():
    session["logged_out"] = True
    # flash("You have been logged out.", "info")
    return redirect(url_for("login"))


# ---------- PUBLIC VIDEO VIEW ----------
@app.route("/view/<int:upload_id>", methods=["GET"])
def view_upload(upload_id):
    upload = Upload.query.get_or_404(upload_id)
    return render_template("view.html", upload=upload)
from flask import session, jsonify

from flask import session, jsonify

@app.route("/view/<int:upload_id>", methods=["POST"])
def api_increment_view(upload_id):
    upload = Upload.query.get_or_404(upload_id)

    # Initialize session key if not present
    if "viewed_uploads" not in session:
        session["viewed_uploads"] = []

    viewed_uploads = session["viewed_uploads"]

    # Only count if this video hasn't been viewed in this session
    if upload_id not in viewed_uploads:
        upload.views += 1
        db.session.commit()

        # Add this video ID to session
        viewed_uploads.append(upload_id)
        session["viewed_uploads"] = viewed_uploads  # 🔑 reassign so it persists

    return jsonify({"views": upload.views})






# ---------- PUBLIC VIDEO LIKE ----------
@app.route("/like/<int:upload_id>", methods=["POST"])
def like_upload(upload_id):
    upload = Upload.query.get_or_404(upload_id)

    liked_videos = session.get("liked_videos", [])
    if upload.id in liked_videos:
        return jsonify({"error": "Already liked"}), 400

    upload.likes = (upload.likes or 0) + 1
    db.session.commit()

    liked_videos.append(upload.id)
    session["liked_videos"] = liked_videos

    return jsonify({"likes": upload.likes})


# ---------- GALLERY ----------
@app.route("/gallery")
def gallery():
    uploads = Upload.query.order_by(Upload.id.desc()).all()
    return render_template("gallery.html", uploads=uploads)


# ---------- USERS ----------
@app.route("/users")
def users():
    all_users = User.query.all()
    current_user = None
    username = session.get("username")
    if username:
        current_user = User.query.filter_by(username=username).first()
    return render_template("users.html", users=all_users, me=current_user)


@app.route('/delete_user/<int:user_id>', methods=['POST'])
def delete_user(user_id):
    user = User.query.get_or_404(user_id)
    db.session.delete(user)
    db.session.commit()
    return redirect(url_for('users'))


# ---------- PROFILE ----------
@app.route("/profile/<username>", methods=["GET", "POST"])
def profile(username):
    user = User.query.filter_by(username=username).first_or_404()

    if request.method == "POST":
        if "avatar" in request.files and request.files["avatar"].filename != "":
            avatar = request.files["avatar"]
            filename = secure_filename(avatar.filename)
            avatar_path = os.path.join(app.config["AVATAR_FOLDER"], filename)
            avatar.save(avatar_path)
            user.avatar = filename
            db.session.commit()
            flash("Avatar updated!", "success")
            return redirect(url_for("profile", username=user.username))

        if "bio" in request.form:
            user.bio = request.form["bio"]
            db.session.commit()
            flash("Bio updated!", "success")
            return redirect(url_for("profile", username=user.username))

    return render_template("profile.html", user=user)


# ---------- UPLOAD AVATAR ----------
@app.route("/upload_avatar", methods=["POST"])
@login_required
def upload_avatar():
    user = User.query.filter_by(username=session["username"]).first()
    file = request.files.get("avatar")
    if not file or file.filename == "":
        flash("No file selected!", "warning")
        return redirect(url_for("dashboard"))

    if file and allowed_avatar(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config["AVATAR_FOLDER"], filename)
        file.save(filepath)
        user.avatar = filename
        db.session.commit()
        flash("Profile picture updated!", "success")
    else:
        flash("Invalid file type. Please upload an image.", "danger")

    return redirect(url_for("dashboard"))


# ---------- CHANGE PASSWORD ----------
@app.route("/change_password", methods=["GET", "POST"])
@login_required
def change_password():
    user = User.query.filter_by(username=session["username"]).first()

    if request.method == "POST":
        current_password = request.form["current_password"]
        new_password = request.form["new_password"]

        is_valid, message = validate_password(new_password)
        if not is_valid:
            flash(f"❌ {message}", "danger")
            return redirect(url_for("change_password"))

        if bcrypt.check_password_hash(user.password, current_password):
            user.password = bcrypt.generate_password_hash(new_password).decode("utf-8")
            db.session.commit()
            flash("Password updated successfully!", "success")
            return redirect(url_for("profile", username=user.username))
        else:
            flash("❌ Wrong current password!", "danger")

    return render_template("change_password.html", user=user)


# ---------- CHANGE USERNAME ----------
@app.route("/change_username", methods=["GET", "POST"])
@login_required
def change_username():
    user = User.query.filter_by(username=session["username"]).first()

    if request.method == "POST":
        new_username = request.form["new_username"]

        if User.query.filter_by(username=new_username).first():
            flash("That username is already taken!", "error")
        else:
            user.username = new_username
            session["username"] = new_username
            db.session.commit()
            flash("Username updated successfully!", "success")
            return redirect(url_for("profile", username=new_username))

    return render_template("change_username.html", user=user)


# ------------------------ DISABLE BACK BUTTON CACHE ------------------------
@app.after_request
def add_header(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# ---------- DELETE UPLOAD ----------
@app.route("/delete/<int:upload_id>", methods=["POST"])
@login_required
def delete_upload(upload_id):
    upload = Upload.query.get_or_404(upload_id)
    user = User.query.filter_by(username=session["username"]).first()

    if upload.user_id != user.id:
        flash("❌ You are not allowed to delete this upload.", "danger")
        return redirect(url_for("dashboard"))

    file_path = os.path.join(app.root_path, "static", "uploads", upload.filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    db.session.delete(upload)
    db.session.commit()

    flash("✅ Upload deleted successfully.", "success")
    return redirect(url_for("dashboard"))


# ---------- FORGOT PASSWORD ----------
@app.route("/forgot_password", methods=["GET", "POST"])
def forgot_password():
    reset_link = None
    message = None
    if request.method == "POST":
        email = request.form.get("email")
        user = User.query.filter_by(email=email).first()
        if user:
            token = serializer.dumps(email, salt="password-reset-salt")
            reset_link = url_for("reset_password", token=token, _external=True)
            message = "✅ Reset link generated! Click below."
        else:
            message = "❌ Email not found."
    return render_template("forgot_password.html", reset_link=reset_link, message=message)


@app.route("/reset_password/<token>", methods=["GET", "POST"])
def reset_password(token):
    try:
        email = serializer.loads(token, salt="password-reset-salt", max_age=3600)
    except SignatureExpired:
        flash("⚠️ Token expired. Please request a new reset link.", "warning")
        return redirect(url_for("forgot_password"))
    except BadSignature:
        return redirect(url_for("forgot_password"))

    user = User.query.filter_by(email=email).first()
    if not user:
        flash("⚠️ User not found.", "danger")
        return redirect(url_for("forgot_password"))

    if request.method == "POST":
        new_password = request.form.get("password")
        is_valid, message = validate_password(new_password)
        if not is_valid:
            flash(f"❌ {message}", "danger")
            return redirect(url_for("reset_password", token=token))

        user.password = bcrypt.generate_password_hash(new_password).decode("utf-8")
        db.session.commit()
        flash("✅ Password reset successfully! Please login.", "success")
        return redirect(url_for("login"))

    return render_template("reset_password.html", email=email)

# ------------------------ RUN APP ------------------------
if __name__ == "__main__":
    with app.app_context():
        db.create_all()  # Creates tables in your online DB
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))

