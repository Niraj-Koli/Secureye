# Secureye

## Installation

### Create a virtual environment

```
pip install virtualenv
```

```
virtualenv env_name
```

```
env_name\scripts\activate
```

### Make and configure a .env File

```env
NODE_ENV = '' // development

VITE_REACT_APP_API_URL = "" // http://localhost:8000
```

## Install frontend packages

```
npm install
```

```
npm run build
```

```
npm run dev
```

## Install backend packages

```
pip install -r requirements.txt
```

### Configure settings.py

```
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "", # db name -> agrivisiondb
        "USER": "", # db user -> postgres
        "PASSWORD": "", # db password -> johndoe@123
        "HOST": "localhost",
    }
}

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = "smtp.gmail.com"
EMAIL_PORT = 587
EMAIL_HOST_USER = "" # email to send authentication messages -> johndoe@email.com
EMAIL_HOST_PASSWORD = "" # email app password -> for gmail it is 16 random characters
EMAIL_USE_TLS = True
```

### Important django commands

```
python manage.py makemigrations
```

```
python manage.py migrate
```

```
python manage.py collectstatic
```

## Run servers

```
npm run dev
```
```
python manage.py runserver
```

### Navigate to django server url and all set
