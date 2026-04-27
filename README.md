# Stories Cafe Chatbot

A full-stack AI-powered cafe ordering platform that supports both traditional menu browsing and conversational ordering using text and voice.

---

## Project Overview

Stories Cafe Chatbot is a web-based ordering system that allows users to:

- Browse a cafe menu  
- Customize items  
- Add to cart and checkout  
- Track orders  
- Interact with an AI assistant using chat or voice  

The system supports both manual ordering and conversational AI ordering, giving users flexibility in how they interact with the system.

---

## Key Features

### Customer
- Browse menu by category  
- Customize items (size, milk, addons)  
- Persistent cart  
- Checkout (pickup or dine-in)  
- Order tracking  
- Guest or authenticated checkout  

### Chatbot AI
- Text and voice ordering  
- Understands natural language  
- Handles missing info (guided ordering)  
- Suggests items  
- Summarizes order before checkout  
- Integrates directly with backend cart  

### Admin
- Manage menu items and images  
- Manage categories and variant groups  
- Enable or disable items  
- Update order statuses  
- View analytics  

---

## Architecture

The system is split into 3 services:

- Frontend (React + Vite)  
- Backend (Node.js + Express)  
- Chatbot (Python FastAPI)  

### High-Level Flow

Frontend → Backend  
Frontend → Chatbot  
Chatbot → Backend  
Backend → MongoDB  

The chatbot never writes directly to the database. All operations go through the backend API.

---

## Tech Stack

### Frontend
- React (SPA)  
- Vite  
- Axios  
- MUI  

### Backend
- Node.js + Express  
- MongoDB + Mongoose  
- JWT (cookie-based auth)  
- Google Cloud Storage (images)  
- Resend (emails)  

### Chatbot
- FastAPI  
- Gemini LLM  
- Redis (optional)  
- Google Speech-to-Text  
- Google Text-to-Speech  

---

## Folder Structure

### Frontend

frontend/
public/
src/
API/
components/
context/
hooks/
pages/
routes/
state/
utils/


### Backend

backend/
src/
config/
controllers/
middleware/
models/
routes/
utils/


### Chatbot

chatbot/
app/
api/
services/
schemas/
utils/


---

## Local Setup

### Prerequisites
- Node.js  
- Python 3  
- MongoDB  
- Redis (optional)  

---

### Default Ports

Frontend: 5173  
Backend: 5000  
Chatbot: 8000  

---

### Startup Order

1. Start MongoDB  
2. Start Redis (optional)  
3. Start Backend  
4. Start Chatbot  
5. Start Frontend  

---

### 1. Frontend


cd frontend
npm install
npm run dev


---

### 2. Backend


cd backend
npm install
npm run dev


---

### 3. Chatbot


cd chatbot
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000


---

### 4. Seed Database (Optional)


cd backend
npm run seed:menu


Warning: This will overwrite existing menu data.

---

## Environment Variables

### Frontend (.env)


VITE_API_BASE_URL=http://localhost:5000

VITE_CHATBOT_URL=http://localhost:8000


---

### Backend (.env)


PORT=5000
MONGODB_URI=your_db
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

JWT_SECRET=...
COOKIE_SECRET=...
TOKEN_SECRET=...

FRONTEND_URL=http://localhost:5173

GOOGLE_CREDENTIALS_JSON={...}
GCS_BUCKET_NAME=...

RESEND_API_KEY=...


---

### Chatbot (.env)


APP_PORT=8000
EXPRESS_API_BASE_URL=http://localhost:5000

OPENAI_PROVIDER=gemini
GEMINI_API_KEY=...

GOOGLE_CREDENTIALS_JSON={...}

REDIS_URL=disabled


---

## Request Flow

### Standard Flow

1. Frontend fetches menu  
2. User adds items to cart  
3. Cart stored in MongoDB  
4. User checks out  
5. Order created and tracked  

---

### Chat Flow

1. User sends message  
2. Chatbot processes intent  
3. Chatbot calls backend  
4. Backend updates cart  
5. Response returned to user  

---

### Voice Flow

1. User speaks  
2. Audio → Speech-to-Text  
3. Transcript → chatbot  
4. Chatbot processes request  
5. Response returned as text and audio  

---

## Key Endpoints

### Backend
- GET /menu  
- GET /menu/categories  
- POST /cart/items  
- GET /cart  
- POST /orders  
- GET /orders/:orderNumber/status  
- POST /auth/login  
- GET /auth/me  

### Chatbot
- POST /chat/message  
- WS /voice/stream  

---

## Deployment

Frontend: Vercel  
Backend: Railway  
Chatbot: Railway  

---

## Production Notes

- Use HTTPS URLs in environment variables  
- Cookies must use sameSite none and secure true  
- CORS must match exact frontend domain  
- Add vercel.json rewrite for routing  

---

## Common Issues

### API not working
Cause: wrong API URL  
Fix: use correct Railway URL  

### Cookies not working
Cause: sameSite lax  
Fix: use sameSite none and secure true  

### Routes like /admin return 404
Cause: Vercel routing  
Fix: add rewrite to index.html  

### Chatbot not responding
Cause: wrong backend URL in chatbot  
Fix: set EXPRESS_API_BASE_URL correctly  

---

## Summary

Stories Cafe Chatbot combines:

- Traditional ordering  
- AI chatbot ordering  
- Voice interaction  

All powered by a modular architecture:

- Frontend handles UI  
- Backend handles logic and data  
- Chatbot handles intelligence  