from fastapi import FastAPI, HTTPException, Header
import uuid
import hashlib
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os
import json
import re
import random
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AI Interview Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "llama-3.3-70b-versatile"

RAG_KB = {
    "behavioral": [
        "Tell me about a time you faced a major technical challenge. How did you resolve it?",
        "Describe a situation where you had to meet a tight deadline with incomplete requirements.",
        "How do you handle disagreements with teammates on technical decisions?",
        "Tell me about a project you're most proud of and why.",
        "Describe a time you received critical feedback and how you responded.",
    ],
    "frontend": [
        "Explain the virtual DOM and its performance implications.",
        "How do you optimize a React app with thousands of list items?",
        "What is the difference between controlled and uncontrolled components?",
        "Explain CSS specificity and how to avoid conflicts in large codebases.",
        "How would you implement code splitting in a large SPA?",
    ],
    "backend": [
        "Design a rate limiting system for a high-traffic API.",
        "Explain ACID properties and when you'd use NoSQL over SQL.",
        "How would you design a URL shortener like bit.ly?",
        "What are the tradeoffs between REST and GraphQL?",
        "Explain the CAP theorem and how it affects distributed systems.",
    ],
    "system_design": [
        "Design a scalable notification system for 10 million users.",
        "How would you design Twitter's trending topics feature?",
        "Design a distributed caching layer for a global application.",
        "How would you architect a real-time collaborative document editor?",
        "Design an autocomplete search system for an e-commerce platform.",
    ],
}

WEIGHTS = {
    "technical_knowledge": 0.30,
    "problem_solving": 0.25,
    "communication_skills": 0.20,
    "project_understanding": 0.15,
    "confidence": 0.10,
}




# ─── Auth Data ────────────────────────────────────────────────────────────────
def hash_pw(p): return hashlib.sha256(p.encode()).hexdigest()

USERS_DB = {
    "hr@demo.com":        {"id":"u1","name":"HR Manager","email":"hr@demo.com","role":"hr","pw":hash_pw("hr123")},
    "candidate@demo.com": {"id":"u2","name":"Demo Candidate","email":"candidate@demo.com","role":"candidate","pw":hash_pw("candidate123")},
}
TOKENS_DB = {}  # token -> user_id
SIGNUP_OTP_DB = {}  # email -> {"otp": str, "expires_at": datetime}

INTERVIEWS_DB_FILE = Path(__file__).with_name("interviews_db.json")
DEFAULT_INTERVIEWS = []

OTP_EXPIRY_MINUTES = max(int(os.getenv("SIGNUP_OTP_TTL_MINUTES", "10")), 1)
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or "587")
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "").strip() or SMTP_USER
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "AI Interview")
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() != "false"


def load_interviews():
    if INTERVIEWS_DB_FILE.exists():
        try:
            data = json.loads(INTERVIEWS_DB_FILE.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
        except Exception:
            pass
    return DEFAULT_INTERVIEWS.copy()


def save_interviews():
    INTERVIEWS_DB_FILE.write_text(json.dumps(INTERVIEWS_DB, indent=2), encoding="utf-8")


INTERVIEWS_DB = load_interviews()

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

def normalize_email(value: str) -> str:
    return (value or "").strip().lower()

def is_valid_email(value: str) -> bool:
    return bool(EMAIL_RE.fullmatch(normalize_email(value)))


def has_special_character(value: str) -> bool:
    return bool(re.search(r"[^A-Za-z0-9]", value or ""))


def validate_signup_password(value: str) -> None:
    if not (value or "").strip():
        raise HTTPException(status_code=400, detail="Password is required")
    if not has_special_character(value):
        raise HTTPException(status_code=400, detail="Password must include at least 1 special character")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_signup_otp_record(email: str) -> Optional[dict]:
    record = SIGNUP_OTP_DB.get(email)
    if not record:
        return None
    if record["expires_at"] <= utc_now():
        SIGNUP_OTP_DB.pop(email, None)
        return None
    return record


def send_signup_otp_email(recipient_email: str, otp: str) -> None:
    if not SMTP_HOST or not SMTP_FROM_EMAIL:
        raise HTTPException(status_code=500, detail="OTP email delivery is not configured on the server")

    message = EmailMessage()
    message["Subject"] = "Your AI Interview signup OTP"
    message["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    message["To"] = recipient_email
    message.set_content(
        "\n".join([
            "Your AI Interview signup OTP is:",
            otp,
            "",
            f"It expires in {OTP_EXPIRY_MINUTES} minutes.",
            "If you did not request this, you can ignore this email.",
        ])
    )

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
            server.ehlo()
            if SMTP_USE_TLS:
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(message)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unable to send OTP email right now") from exc


def to_number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def get_recommendation_for_score(score: float) -> str:
    if score >= 75:
        return "Strong Hire"
    if score >= 50:
        return "Hire"
    if score >= 40:
        return "Maybe"
    return "No Hire"


def get_coding_analysis_score(analysis: dict) -> Optional[float]:
    if not isinstance(analysis, dict):
        return None

    overall = to_number(analysis.get("overall_score"))
    if overall is not None:
        return overall

    parts = [to_number(analysis.get("correctness")), to_number(analysis.get("code_quality"))]
    parts = [value for value in parts if value is not None]
    if not parts:
        return None
    return sum(parts) / len(parts)


def get_coding_output_score(output: str) -> Optional[float]:
    if not isinstance(output, str) or not output.strip():
        return None

    lines = [line.strip() for line in output.splitlines() if line.strip()]
    normalized_text = output.lower()
    test_lines = [line for line in lines if re.search(r"test\s*\d+", line, re.IGNORECASE)]
    relevant = test_lines or lines

    passed = 0
    failed = 0
    for line in relevant:
        normalized = line.lower()
        if any(token in normalized for token in ["pass", "passed", "works correctly", "match", "✓"]):
            passed += 1
            continue
        if any(token in normalized for token in ["fail", "failed", "error", "incorrect", "no runnable solution"]):
            failed += 1

    total = passed + failed
    if total == 0:
        if any(token in normalized_text for token in [
            "all tests passed",
            "both tests passed",
            "results match expected output",
            "pattern matching works as expected",
        ]):
            return 10
        if any(token in normalized_text for token in [
            "tests failed",
            "test failed",
            "does not match expected",
        ]):
            return 0
    if total == 0:
        return None
    return (passed / total) * 10


def normalize_interview_record(iv: dict) -> dict:
    if not isinstance(iv, dict):
        return iv

    coding = iv.get("coding") or {}
    problems = coding.get("problems") or []
    total_questions = max(int(to_number(coding.get("total_questions")) or 0), len(problems))

    if not problems or total_questions <= 0:
        return iv

    scores = []
    for problem in problems:
        score = get_coding_analysis_score(problem.get("analysis"))
        if score is None:
            score = get_coding_output_score(problem.get("testcase_output"))
        scores.append(score if score is not None else 0)

    if not any(score > 0 for score in scores):
        return iv

    derived_score = round((sum(scores) / total_questions) * 10)
    normalized = dict(iv)
    normalized["score"] = derived_score
    normalized["recommendation"] = get_recommendation_for_score(derived_score)
    return normalized


def get_current_user(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    uid = TOKENS_DB.get(token)
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    for u in USERS_DB.values():
        if u["id"] == uid:
            return u
    raise HTTPException(status_code=401, detail="User not found")


# ─── Auth Models ──────────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    name: str
    email: str
    password: str
    otp: str
    role: str = "candidate"

class SignupOtpRequest(BaseModel):
    email: str

class LoginRequest(BaseModel):
    email: str
    password: str


# ─── Auth Endpoints ───────────────────────────────────────────────────────────
@app.post("/auth/request-signup-otp")
async def request_signup_otp(req: SignupOtpRequest):
    email = normalize_email(req.email)
    if not is_valid_email(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    if email in USERS_DB:
        raise HTTPException(status_code=400, detail="Email already registered")

    otp = f"{random.randint(0, 999999):06d}"
    SIGNUP_OTP_DB[email] = {
        "otp": otp,
        "expires_at": utc_now() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    }
    send_signup_otp_email(email, otp)
    return {"ok": True, "message": f"OTP sent to {email}"}


@app.post("/auth/signup")
async def signup(req: SignupRequest):
    email = normalize_email(req.email)
    name = (req.name or "").strip()
    if not is_valid_email(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    if not name:
        raise HTTPException(status_code=400, detail="Full name is required")
    if email in USERS_DB:
        raise HTTPException(status_code=400, detail="Email already registered")
    validate_signup_password(req.password)

    otp_record = get_signup_otp_record(email)
    if not otp_record:
        raise HTTPException(status_code=400, detail="Request a new OTP to continue signup")
    if (req.otp or "").strip() != otp_record["otp"]:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    uid = "u" + str(uuid.uuid4())[:8]
    USERS_DB[email] = {"id":uid,"name":name,"email":email,"role":req.role,"pw":hash_pw(req.password)}
    SIGNUP_OTP_DB.pop(email, None)
    token = str(uuid.uuid4())
    TOKENS_DB[token] = uid
    u = USERS_DB[email]
    return {"token": token, "user": {"id":u["id"],"name":u["name"],"email":u["email"],"role":u["role"]}}

@app.post("/auth/login")
async def login(req: LoginRequest):
    u = USERS_DB.get(normalize_email(req.email))
    if not u or u["pw"] != hash_pw(req.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = str(uuid.uuid4())
    TOKENS_DB[token] = u["id"]
    return {"token": token, "user": {"id":u["id"],"name":u["name"],"email":u["email"],"role":u["role"]}}

@app.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        TOKENS_DB.pop(authorization.split(" ",1)[1], None)
    return {"ok": True}

@app.get("/auth/me")
async def me(authorization: Optional[str] = Header(default=None)):
    u = get_current_user(authorization)
    return {"id":u["id"],"name":u["name"],"email":u["email"],"role":u["role"]}


# ─── Interview Save/Fetch ─────────────────────────────────────────────────────
class SaveInterviewRequest(BaseModel):
    role: str
    score: float
    recommendation: str
    skills: List[str] = []
    summary: str = ""
    strengths: List[str] = []
    improvements: List[str] = []
    scores: dict = {}
    proctoring: dict = {}
    qa: List[dict] = []
    coding: dict = {}

@app.post("/interviews/save")
async def save_interview(req: SaveInterviewRequest, authorization: Optional[str] = Header(default=None)):
    u = get_current_user(authorization)
    import datetime
    iv = {
        "id": str(uuid.uuid4()),
        "user_id": u["id"],
        "name": u["name"],
        "role": req.role,
        "date": datetime.date.today().isoformat(),
        "score": req.score,
        "recommendation": req.recommendation,
        "skills": req.skills,
        "summary": req.summary,
        "strengths": req.strengths,
        "improvements": req.improvements,
        "scores": req.scores,
        "proctoring": req.proctoring,
        "qa": req.qa,
        "coding": req.coding,
    }
    iv = normalize_interview_record(iv)
    INTERVIEWS_DB.append(iv)
    save_interviews()
    return {"id": iv["id"], "ok": True}

@app.get("/interviews/my")
async def my_interviews(authorization: Optional[str] = Header(default=None)):
    u = get_current_user(authorization)
    mine = [normalize_interview_record(i) for i in INTERVIEWS_DB if i["user_id"] == u["id"]]
    return {"interviews": sorted(mine, key=lambda x: x["date"], reverse=True)}

@app.get("/interviews/all")
async def all_interviews(authorization: Optional[str] = Header(default=None)):
    u = get_current_user(authorization)
    if u["role"] != "hr":
        raise HTTPException(status_code=403, detail="HR access only")
    normalized = [normalize_interview_record(i) for i in INTERVIEWS_DB]
    return {"interviews": sorted(normalized, key=lambda x: x["date"], reverse=True)}

async def call_groq(messages: list, max_tokens: int = 1024) -> str:
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not set in .env file")
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={"model": MODEL, "max_tokens": max_tokens, "temperature": 0.7, "messages": messages},
        )
    if res.status_code != 200:
        err = res.json()
        raise HTTPException(status_code=res.status_code, detail=err.get("error", {}).get("message", "Groq API error"))
    return res.json()["choices"][0]["message"]["content"]


def parse_json(raw: str):
    try:
        return json.loads(raw.strip())
    except Exception:
        arr = re.search(r'\[[\s\S]*\]', raw)
        if arr:
            return json.loads(arr.group())
        obj = re.search(r'\{[\s\S]*\}', raw)
        if obj:
            return json.loads(obj.group())
        clean = re.sub(r'```json|```', '', raw).strip()
        return json.loads(clean)


def is_placeholder_code(code: str) -> bool:
    if not code or not code.strip():
        return True
    lowered = code.lower()
    if "your solution here" in lowered or "todo" in lowered:
        return True
    non_empty = [line.strip() for line in code.splitlines() if line.strip()]
    if len(non_empty) <= 2:
        return True
    if all(line in {"pass", "}", "{", "};"} for line in non_empty):
        return True
    return False


# ── Request Models ────────────────────────────────────────────────────────────
class GenerateQuestionsRequest(BaseModel):
    role: str
    resume_text: Optional[str] = ""

class EvaluateAnswerRequest(BaseModel):
    role: str
    question: str
    answer: str

class GenerateReportRequest(BaseModel):
    role: str
    answers: List[dict]

class AnalyzeCodeRequest(BaseModel):
    problem_title: str
    code: str
    examples: List[str]
    language: str = "javascript"

class RunCodeRequest(BaseModel):
    problem_title: str
    code: str
    examples: List[str]
    language: str = "javascript"

class RAGSearchRequest(BaseModel):
    query: str

class AskRecruiterRequest(BaseModel):
    candidate_name: str
    candidate_role: str
    score: float
    recommendation: str
    skills: List[str]
    question: str


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "AI Interview Assistant API running", "model": MODEL}



class GenerateCodingProblemsRequest(BaseModel):
    prompt: str
    language: str = "javascript"

@app.post("/generate-coding-problems")
async def generate_coding_problems(req: GenerateCodingProblemsRequest):
    """Generates 3 coding problems based on resume or AI choice, for any language."""
    content_msg = f"""{req.prompt}

Generate exactly 3 coding problems for a {req.language} coding interview.
Respond with ONLY a valid JSON array. No text before or after.
Each object must have: title, difficulty (Easy/Medium/Hard), tags (array), description, examples (array of strings).
The difficulty mix must be exactly: 2 Easy and 1 Medium.
The questions should feel fresh and varied for this candidate, not generic repeats.
Do not make all 3 problems array-based.
Prefer company-style hiring questions across different areas such as strings, stacks, heaps, trees, graphs, intervals, design, scheduling, or practical data handling when relevant.

Example format:
[
  {{
    "title": "Two Sum",
    "difficulty": "Easy",
    "tags": ["Array", "HashMap"],
    "description": "Given an array of integers...",
    "examples": ["Input: nums=[2,7,11,15], target=9 → Output: [0,1]"]
  }}
]"""

    raw = await call_groq([{"role": "user", "content": content_msg}], max_tokens=1500)
    try:
        problems = parse_json(raw)
        if not isinstance(problems, list):
            raise ValueError("Not a list")
        easy = [p for p in problems if str(p.get("difficulty", "")).lower() == "easy"]
        medium = [p for p in problems if str(p.get("difficulty", "")).lower() == "medium"]
        selected = easy[:2] + medium[:1]
        if len(selected) < 3:
            selected = problems[:3]
        return {"problems": selected[:3]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parse error: {str(e)} | Raw: {raw[:200]}")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/rag-kb")
def get_rag_kb():
    return {"kb": RAG_KB}


@app.post("/generate-questions")
async def generate_questions(req: GenerateQuestionsRequest):
    base = f"Generate exactly 5 interview questions for a {req.role} role"
    resume_part = f" based on this resume:\n{req.resume_text}" if req.resume_text else " covering technical and behavioral topics"
    content = f"""{base}{resume_part}.

Respond with ONLY a valid JSON array of 5 strings. No text before or after.
Example: ["Question 1?","Question 2?","Question 3?","Question 4?","Question 5?"]"""

    raw = await call_groq([{"role": "user", "content": content}])
    try:
        questions = parse_json(raw)
        if not isinstance(questions, list):
            raise ValueError("Response is not a list")
        return {"questions": questions[:5]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parse error: {str(e)} | Raw: {raw[:200]}")


@app.post("/evaluate-answer")
async def evaluate_answer(req: EvaluateAnswerRequest):
    content = f"""Evaluate this interview answer.

Role: {req.role}
Question: {req.question}
Answer: {req.answer}

Respond with ONLY this JSON, no text before or after:
{{"scores":{{"technical_knowledge":7,"problem_solving":6,"communication_skills":8,"project_understanding":6,"confidence":7}},"strength":"What was good in one sentence","improvement":"What to improve in one sentence"}}"""

    raw = await call_groq([{"role": "user", "content": content}], max_tokens=500)
    try:
        result = parse_json(raw)
        result["weighted_total"] = round(
            sum(result["scores"].get(k, 5) * v for k, v in WEIGHTS.items()), 1
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parse error: {str(e)}")


@app.post("/generate-report")
async def generate_report(req: GenerateReportRequest):
    qa_text = "\n\n".join([f"Q{i+1}: {a['q']}\nA: {a['a']}" for i, a in enumerate(req.answers)])

    avg_scores = {}
    for key in WEIGHTS:
        vals = [a.get("scores", {}).get(key, 5) for a in req.answers]
        avg_scores[key] = round(sum(vals) / len(vals), 1)
    weighted_total = round(sum(avg_scores[k] * v for k, v in WEIGHTS.items()), 1)

    content = f"""Generate a recruiter-style interview report.

Role: {req.role}
Q&A:
{qa_text}

Respond with ONLY this JSON, no text before or after:
{{"overall_score":7,"recommendation":"Hire","summary":"2-3 sentence summary.","strengths":["strength 1","strength 2"],"improvements":["improvement 1","improvement 2"]}}

recommendation must be one of: Strong Hire, Hire, Maybe, No Hire"""

    raw = await call_groq([{"role": "user", "content": content}], max_tokens=700)
    try:
        base = parse_json(raw)
        base["metric_scores"] = avg_scores
        base["weighted_total"] = weighted_total
        return base
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parse error: {str(e)}")


@app.post("/analyze-code")
async def analyze_code(req: AnalyzeCodeRequest):
    if is_placeholder_code(req.code):
        return {
            "time_complexity": "N/A",
            "space_complexity": "N/A",
            "correctness": 0,
            "code_quality": 0,
            "bugs": ["Starter template submitted without a real solution."],
            "suggestions": ["Write a real implementation before running analysis."],
            "overall_score": 0,
            "verdict": "Needs Work",
        }

    content = f"""Do a code review for this {req.language} solution.

Problem: {req.problem_title}
Code:
{req.code}

Respond with ONLY this JSON, no text before or after:
{{"time_complexity":"O(n)","space_complexity":"O(1)","correctness":8,"code_quality":7,"bugs":[],"suggestions":["tip 1","tip 2"],"overall_score":8,"verdict":"Good"}}

verdict must be one of: Optimal, Good, Acceptable, Needs Work"""

    raw = await call_groq([{"role": "user", "content": content}], max_tokens=600)
    try:
        return parse_json(raw)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parse error: {str(e)}")


@app.post("/run-code")
async def run_code(req: RunCodeRequest):
    if is_placeholder_code(req.code):
        return {"output": "No runnable solution detected. Please replace the starter template with your implementation."}

    content = f"""Simulate running this {req.language} code for "{req.problem_title}".

Test cases:
{chr(10).join(req.examples)}

Code:
{req.code}

Show results like:
Test 1: [0,1] ✓
Test 2: [1,2] ✓

If the code is incomplete, invalid, or clearly just a template, say so explicitly instead of claiming tests passed.
Plain text only. Max 5 lines."""

    output = await call_groq([{"role": "user", "content": content}], max_tokens=300)
    return {"output": output}


@app.post("/rag-search")
async def rag_search(req: RAGSearchRequest):
    all_qs = [{"cat": cat, "q": q} for cat, qs in RAG_KB.items() for q in qs]
    content = f"""Semantic search query: "{req.query}"

Questions:
{chr(10).join([f"{i}: {item['q']}" for i, item in enumerate(all_qs)])}

Return ONLY a JSON array of 4 most relevant indices. Example: [0,3,7,12]"""

    raw = await call_groq([{"role": "user", "content": content}], max_tokens=100)
    try:
        indices = parse_json(raw)
        results = [all_qs[i] for i in indices[:4] if i < len(all_qs)]
        return {"results": results}
    except Exception:
        ql = req.query.lower()
        results = [item for item in all_qs if ql in item["q"].lower()][:4]
        return {"results": results}


@app.post("/ask-recruiter")
async def ask_recruiter(req: AskRecruiterRequest):
    content = f"""You are a recruiting assistant.

Candidate: {req.candidate_name}
Role: {req.candidate_role}
Score: {req.score}/10
Recommendation: {req.recommendation}
Skills: {", ".join(req.skills)}

HR Question: {req.question}

Answer professionally in 2-3 sentences."""

    answer = await call_groq([{"role": "user", "content": content}], max_tokens=300)
    return {"answer": answer}
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
from fastapi import UploadFile, File
import pdfplumber
import io

@app.post("/parse-resume")
async def parse_resume(file: UploadFile = File(...)):
    content = await file.read()

    text = ""

    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                text += page.extract_text() or ""
    except Exception:
        try:
            text = content.decode("utf-8", errors="ignore")
        except Exception:
            text = ""

    return {"text": text}
