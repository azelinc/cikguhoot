#!/usr/bin/env python3
"""
Cikgu Hoot v2 — AI Tutor with Textbook Content + Progress Tracking
Runs on port 8001, routes through Traefik at tutor.azelinc.tech
"""
import os, json, sys, glob, re
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import URLError

# --- Configuration ---
DEEPSEEK_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"
TEXTBOOK_DIR = "/app/textbook"
PROGRESS_FILE = "/data/progress.json"

# Subject → year → topic key mapping
SUBJECTS = {
    "math": {
        "name": "Mathematics",
        "icon": "🔢",
        "years": {
            "4": {
                "name": "Year 4 (DLP)",
                "units": {
                    "1": {
                        "name": "Numbers and Operations",
                        "topics": [
                            ("1.1", "Explore Numbers"),
                            ("1.2", "Even Numbers and Odd Numbers"),
                            ("1.3", "Estimation"),
                            ("1.4", "Round Off Numbers"),
                            ("1.5", "Mixed Operations"),
                            ("1.6", "Solve the Problems"),
                        ]
                    },
                    "2": {
                        "name": "Fractions, Decimals, Percentages",
                        "topics": [
                            ("2.1", "Addition of Decimals"),
                            ("2.2", "Subtraction of Decimals"),
                            ("2.3", "Multiplication of Decimals"),
                            ("2.4", "Division of Decimals"),
                            ("2.5", "Convert Fractions and Percentages"),
                            ("2.6", "Solve the Problems"),
                        ]
                    },
                    "3": {
                        "name": "Money",
                        "topics": [("3.1", "Manage Money Wisely")]
                    },
                    "4": {
                        "name": "Time",
                        "topics": [("4.1", "12-hour and 24-hour Systems")]
                    },
                    "5": {
                        "name": "Length, Mass, Volume",
                        "topics": [("5.1", "Units of Length")]
                    },
                    "6": {
                        "name": "Space",
                        "topics": [("6.1", "Angles and 2D Shapes")]
                    },
                    "7": {
                        "name": "Coordinates, Ratio, Proportion",
                        "topics": [("7.1", "Coordinates")]
                    },
                    "8": {
                        "name": "Data Handling",
                        "topics": [("8.1", "Pictographs and Bar Charts")]
                    }
                }
            }
        }
    },
    "science": {
        "name": "Science",
        "icon": "🔬",
        "years": {
            "4": {"name": "Year 4 (DLP)", "units": {}},
            "5": {"name": "Year 5 (DLP)", "units": {}},
            "6": {"name": "Year 6 (DLP)", "units": {}}
        }
    }
}

# --- Lesson Flow Templates ---
LESSON_TEMPLATES = {
    "teach": """You will now TEACH this topic. Follow this structure:

1. **Hook** (1 sentence) — A fun question or fact to get the student interested
2. **Explain** (2-3 sentences) — Explain the concept in simple terms with a real-life example
3. **Definition** — State the key rules or formulas clearly

After teaching, ask the student: "Do you understand? Should I give you an example?""" ,

    "example": """Show the student a WORKED EXAMPLE. Follow this structure:

1. Present the problem
2. Solve it step by step, explaining each step
3. Show the final answer clearly

Then ask: "Would you like to try one yourself?" """,

    "practice": """Ask the student a PRACTICE QUESTION based on this topic.

- Give ONE question at a time
- If they get it right: praise them and ask a new question
- If they get it wrong: explain why and give a simpler version of the same question
- After 3-5 questions total, say: "Great work! Let's review what you've learned."

Make sure questions are appropriate for a 10-year-old.""",

    "review": """Summarize what was taught in 2-3 sentences. Highlight:
- The most important rule or concept
- What the student did well
- One thing to practice more

Then ask: "Ready for the next topic?" """
}

# --- Load Textbook Content ---
def load_textbook(topic_id):
    """Load textbook content for a topic. topic_id like '1.1'"""
    slug = topic_id.replace(".", "-")
    patterns = [
        f"topic-{slug}-*.txt",
        f"topic-{slug}.txt",
        f"*topic-{topic_id}-*.txt",
    ]
    for pattern in patterns:
        files = glob.glob(os.path.join(TEXTBOOK_DIR, pattern))
        if files:
            with open(files[0], "r") as f:
                return f.read()
    return None

# --- Progress Management ---
def load_progress():
    try:
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def save_progress(progress):
    os.makedirs(os.path.dirname(PROGRESS_FILE), exist_ok=True)
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)

def get_topic_progress(child_id, topic_id):
    p = load_progress()
    return p.get(child_id, {}).get(topic_id, {})

def update_topic_progress(child_id, topic_id, data):
    p = load_progress()
    if child_id not in p:
        p[child_id] = {}
    p[child_id][topic_id] = {
        **p[child_id].get(topic_id, {}),
        **data,
        "last_updated": __import__("datetime").datetime.now().isoformat()
    }
    save_progress(p)

# --- Lesson Step Handler ---
def build_lesson_prompt(topic_id, child_name, grade, subject, step, textbook_content, previous_context):
    """Build the full system + user prompt for the AI tutor."""
    progress = get_topic_progress(child_name.lower(), topic_id)

    system = f"""You are Cikgu Hoot 🦉, a friendly KSSR tutor.

You are teaching {subject} to {child_name} ({grade}).
Topic ID: {topic_id}
Current lesson step: {step.upper()}

LESSON PHASES (follow strictly):
1. TEACH → Explain concepts from the textbook
2. EXAMPLE → Show worked examples  
3. PRACTICE → Ask questions, check understanding
4. REVIEW → Summarize and wrap up

RULES:
- Use SIMPLE English suitable for a 10-year-old
- Be warm, encouraging, use emojis 🎉⭐
- NEVER give the answer directly in practice — guide the student
- Keep responses concise (3-5 sentences)
- If they're stuck, simplify and use a different approach
- Praise effort, not just correct answers"""

    # Add textbook content if available
    if textbook_content:
        system += f"\n\nTEXTBOOK CONTENT for this topic:\n\n{textbook_content[:6000]}"

    # Add previous progress if any
    if progress:
        system += f"\n\nPREVIOUS ATTEMPTS: score={progress.get('score', 'N/A')}%, steps_completed={progress.get('steps', [])}"
        system += f"\nFocus on areas they struggled with."

    # Lesson step instructions
    step_instruction = LESSON_TEMPLATES.get(step, LESSON_TEMPLATES["teach"])
    system += f"\n\n--- LESSON STEP: {step.upper()} ---\n{step_instruction}"

    return system

# --- HTTP Handler ---
class TutorHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/subjects":
            self.send_json(200, SUBJECTS)
        elif self.path == "/api/progress":
            params = dict(p.split("=") for p in self.path.split("?")[1].split("&") if "=" in p)
            child = params.get("child", "")
            if child:
                p = load_progress()
                self.send_json(200, p.get(child, {}))
            else:
                self.send_json(200, load_progress())
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == "/api/tutor":
            self.handle_tutor()
        elif self.path == "/api/progress":
            self.handle_progress_update()
        else:
            self.send_error(404)

    def handle_tutor(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}

        child_name = body.get("child_name", "")
        child_grade = body.get("child_grade", "")
        subject = body.get("subject", "math")
        subject_name = SUBJECTS.get(subject, {}).get("name", "Mathematics")
        topic_id = body.get("topic_id", "1.1")
        lesson_step = body.get("step", "teach")
        messages = body.get("messages", [])
        textbook_content = body.get("textbook", "")

        # If no textbook content provided, try to load it
        if not textbook_content:
            textbook_content = load_textbook(topic_id) or ""

        system = build_lesson_prompt(
            topic_id=topic_id,
            child_name=child_name,
            grade=child_grade,
            subject=subject_name,
            step=lesson_step,
            textbook_content=textbook_content,
            previous_context=messages[-4:] if messages else []
        )

        ds_messages = [{"role": "system", "content": system}]
        for m in messages[-20:]:
            ds_messages.append({"role": m["role"], "content": m["content"]})

        payload = json.dumps({
            "model": "deepseek-chat",
            "messages": ds_messages,
            "max_tokens": 1024,
            "temperature": 0.7,
        }).encode()

        req = Request(DEEPSEEK_URL, data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {DEEPSEEK_KEY}",
            })

        try:
            resp = urlopen(req, timeout=30)
            data = json.loads(resp.read())
            reply = data["choices"][0]["message"]["content"]

            self.send_response(200)
            self.send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "role": "assistant",
                "content": reply,
                "topic_id": topic_id,
            }).encode())

        except Exception as e:
            self.send_response(502)
            self.send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)[:200]}).encode())

    def handle_progress_update(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}

        child_id = body.get("child", "")
        topic_id = body.get("topic", "")
        data = {k: v for k, v in body.items() if k in ("score", "steps", "status", "mistakes")}

        if child_id and topic_id:
            update_topic_progress(child_id, topic_id, data)
            self.send_json(200, {"ok": True})
        else:
            self.send_json(400, {"error": "missing child or topic"})

    def send_json(self, status, data):
        self.send_response(status)
        self.send_cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def log_message(self, fmt, *args):
        if len(args) >= 3:
            print(f"[TutorProxy] {args[0]} {args[1]} {args[2]}", flush=True)
        elif args:
            print(f"[TutorProxy] {fmt % args}", flush=True)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001

    # Check for key
    if not DEEPSEEK_KEY:
        try:
            with open("/opt/data/profiles/ibu/.env") as f:
                for line in f:
                    if line.startswith("DEEPSEEK_API_KEY="):
                        DEEPSEEK_KEY = line.strip().split("=", 1)[1]
                        break
        except:
            pass

    if not DEEPSEEK_KEY:
        print("FATAL: No DeepSeek API key", flush=True)
        # Try env file in /app
        try:
            with open("/app/.env") as f:
                for line in f:
                    if line.startswith("DEEPSEEK_API_KEY="):
                        DEEPSEEK_KEY = line.strip().split("=", 1)[1]
                        break
        except:
            pass

    server = HTTPServer(("0.0.0.0", port), TutorHandler)
    print(f"[TutorProxy v2] Running on 0.0.0.0:{port}", flush=True)
    print(f"[TutorProxy v2] Textbook dir: {TEXTBOOK_DIR}", flush=True)
    print(f"[TutorProxy v2] Progress file: {PROGRESS_FILE}", flush=True)
    server.serve_forever()
