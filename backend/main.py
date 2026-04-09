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

INTERVIEWS_DB_FILE = Path(__file__).with_name("interviews_db.json")
DEFAULT_INTERVIEWS = [
    {"id":"i1","user_id":"u2","name":"Demo Candidate","role":"Software Engineer","date":"2024-01-10","score":78,
     "recommendation":"Hire","skills":["React","Python","System Design"],
     "summary":"Strong frontend knowledge. Needs improvement in distributed systems.",
     "strengths":["Clear communication","Good React depth"],"improvements":["System design gaps"],
     "scores":{"technical_knowledge":8,"problem_solving":7,"communication_skills":9,"project_understanding":7,"confidence":8}},
    {"id":"i2","user_id":"u2","name":"Demo Candidate","role":"Backend Engineer","date":"2024-01-15","score":85,
     "recommendation":"Strong Hire","skills":["Python","FastAPI","SQL"],
     "summary":"Excellent backend fundamentals. Confident and articulate.",
     "strengths":["Deep Python knowledge","Excellent problem solving"],"improvements":["Leadership examples sparse"],
     "scores":{"technical_knowledge":9,"problem_solving":9,"communication_skills":8,"project_understanding":8,"confidence":9}},
]


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
    role: str = "candidate"

class LoginRequest(BaseModel):
    email: str
    password: str


# ─── Auth Endpoints ───────────────────────────────────────────────────────────
@app.post("/auth/signup")
async def signup(req: SignupRequest):
    if req.email in USERS_DB:
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = "u" + str(uuid.uuid4())[:8]
    USERS_DB[req.email] = {"id":uid,"name":req.name,"email":req.email,"role":req.role,"pw":hash_pw(req.password)}
    token = str(uuid.uuid4())
    TOKENS_DB[token] = uid
    u = USERS_DB[req.email]
    return {"token": token, "user": {"id":u["id"],"name":u["name"],"email":u["email"],"role":u["role"]}}

@app.post("/auth/login")
async def login(req: LoginRequest):
    u = USERS_DB.get(req.email)
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
    }
    INTERVIEWS_DB.append(iv)
    save_interviews()
    return {"id": iv["id"], "ok": True}

@app.get("/interviews/my")
async def my_interviews(authorization: Optional[str] = Header(default=None)):
    u = get_current_user(authorization)
    mine = [i for i in INTERVIEWS_DB if i["user_id"] == u["id"]]
    return {"interviews": sorted(mine, key=lambda x: x["date"], reverse=True)}

@app.get("/interviews/all")
async def all_interviews(authorization: Optional[str] = Header(default=None)):
    u = get_current_user(authorization)
    if u["role"] != "hr":
        raise HTTPException(status_code=403, detail="HR access only")
    return {"interviews": sorted(INTERVIEWS_DB, key=lambda x: x["date"], reverse=True)}

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

class RunCodeRequest(BaseModel):
    problem_title: str
    code: str
    examples: List[str]

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
    """Generates 4 coding problems based on resume or AI choice, for any language."""
    content_msg = f"""{req.prompt}

Generate exactly 4 coding problems for a {req.language} coding interview.
Respond with ONLY a valid JSON array. No text before or after.
Each object must have: title, difficulty (Easy/Medium/Hard), tags (array), description, examples (array of strings).

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
        return {"problems": problems[:4]}
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
    content = f"""Do a code review for this solution.

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
    content = f"""Simulate running this JavaScript code for "{req.problem_title}".

Test cases:
{chr(10).join(req.examples)}

Code:
{req.code}

Show results like:
Test 1: [0,1] ✓
Test 2: [1,2] ✓

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
