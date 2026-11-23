"""
server/app.py — OLA 백엔드 프록시 (선택 사항)
==============================================================================
이 서버를 실행하면 OpenAI API 키와 공공데이터포털 인증키가 브라우저에
전혀 노출되지 않습니다. 키는 이 서버가 읽는 .env 파일에만 저장되고,
프론트엔드(js/config.js)는 이 서버의 주소만 알면 됩니다.

또한 이 프록시는 공공데이터포털(apis.data.go.kr) 호출 시 발생하는
CORS 문제도 함께 해결해줍니다 (README_API.md의 "CORS 안내" 참고).

실행 방법
---------
1) cd server
2) python -m venv venv && source venv/bin/activate   (Windows: venv\\Scripts\\activate)
3) pip install -r requirements.txt
4) cp .env.example .env   →  .env 파일을 열어 실제 키 입력
5) python app.py           →  기본적으로 http://localhost:5000 에서 실행됨

프론트엔드 연결 방법 (js/config.js)
------------------------------------
  OPENAI_PROXY_URL: "http://localhost:5000/api/chat",
  PROXY_BASE_URL:   "http://localhost:5000/api/public-data",
그리고 OPENAI_API_KEY / PUBLIC_DATA_API_KEY 는 비워두면 됩니다
(브라우저가 아니라 이 서버의 .env 값이 사용됩니다).

벡터DB (ChromaDB) 안내
------------------------------------
민원(complaint.html) 카테고리 의미 매칭과 AI상담(consult.html) KB 검색에 쓰이던
"벡터DB"는 원래 브라우저(js/embedding.js)가 직접 OpenAI 임베딩을 받아
localStorage에 캐시해두고 코사인 유사도를 계산하는 방식이었습니다.
이제는 이 서버가 ChromaDB(로컬 파일 기반 영속 벡터DB, 기본적으로 프로젝트
폴더 안의 server/chroma_db/ 에 저장됨 — 팀원들과 같은 상대 경로를 쓰기 위해.
.gitignore에 이미 chroma_db/ 추가해뒀으니 git에는 안 올라감)를 사용해
인덱싱·검색을 모두 서버에서 처리합니다. ⚠️ VS Code Live Server를 쓴다면
반드시 .vscode/settings.json의 liveServer.settings.ignoreFiles에
"server/**"를 추가해야, ChromaDB가 내부 파일을 계속 갱신할 때마다
브라우저가 자꾸 새로고침되는 문제를 피할 수 있습니다.
  - POST /api/vector/upsert : 문서(id, text) 목록을 임베딩해서 Chroma 컬렉션에 저장
  - POST /api/vector/search : 질의를 임베딩해서 Chroma 컬렉션에서 최근접 문서 검색
js/embedding.js의 공개 API(isAvailable/buildIndex/search)는 그대로 유지되므로
js/issue.js, js/insight.js 등 호출부는 수정할 필요가 없습니다.
pip install -r requirements.txt 실행 시 chromadb가 함께 설치됩니다.
==============================================================================
"""

import os
import re
from urllib.parse import unquote

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    import chromadb
    CHROMADB_IMPORT_ERROR = ""
except (ImportError, OSError) as exc:
    chromadb = None
    CHROMADB_IMPORT_ERROR = str(exc)

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL_DEFAULT = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_EMBEDDING_MODEL_DEFAULT = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
PUBLIC_DATA_API_KEY = os.getenv("PUBLIC_DATA_API_KEY", "")
# 한국환경공단 에어코리아(미세먼지) 전용 인증키 — 비어 있으면 PUBLIC_DATA_API_KEY를 그대로 사용.
AIRKOREA_API_KEY = os.getenv("AIRKOREA_API_KEY", "")
KAKAO_JAVASCRIPT_KEY = os.getenv("KAKAO_JAVASCRIPT_KEY", "")

app = Flask(__name__)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://127.0.0.1:5588,http://localhost:5588" \
        ""
    ).split(",")
    if origin.strip()
]
CORS(
    app,
    resources={
        r"/api/.*": {"origins": CORS_ORIGINS},
        r"/public-data.*": {"origins": CORS_ORIGINS},
    },
)
# ==============================================================================
# ChromaDB (로컬 영속 벡터DB) — 기본적으로 프로젝트 폴더 안의 server/chroma_db/
# 에 저장됩니다 (팀원들과 같은 상대 경로를 공유하기 위해). .gitignore에
# chroma_db/ 를 추가해뒀으니 git에는 커밋되지 않고, 각자 컴퓨터에서 서버를
# 처음 켤 때 자동으로 다시 만들어집니다.
#
# ⚠️ ChromaDB는 조회/저장할 때마다 내부 sqlite 파일을 계속 수정합니다.
# VS Code Live Server처럼 프로젝트 폴더 전체를 감시하며 자동 새로고침하는
# 도구를 쓴다면, 이 폴더 변경 때문에 브라우저가 계속(약 1초 간격) 새로고침될
# 수 있습니다 → .vscode/settings.json에 아래처럼 추가해서 감시 대상에서
# 제외하고, 반드시 Live Server를 완전히 껐다가 다시 켜세요(설정 변경은
# 재시작해야 반영됩니다):
#   "liveServer.settings.ignoreFiles": [".vscode/**", "server/**"]
#
# 팀원들과 공유하지 않고 이 폴더를 프로젝트 밖(예: 사용자 홈)에 두고 싶다면
# .env에 CHROMA_DB_DIR=원하는/절대/경로 를 추가하세요.
# ==============================================================================
CHROMA_DB_DIR = os.getenv("CHROMA_DB_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "chroma_db")
_chroma_client = chromadb.PersistentClient(path=CHROMA_DB_DIR) if chromadb else None


def _safe_collection_name(name):
    """Chroma 컬렉션 이름 규칙(영문/숫자/._- 3~63자, 영숫자로 시작·끝)에 맞춰 정리."""
    cleaned = re.sub(r"[^a-zA-Z0-9._-]", "-", str(name or "default"))
    cleaned = cleaned.strip("-._")
    if len(cleaned) < 3:
        cleaned = (cleaned + "-col").ljust(3, "0")
    return cleaned[:63]


def _get_collection(name):
    if _chroma_client is None:
        raise RuntimeError(f"ChromaDB를 사용할 수 없습니다: {CHROMADB_IMPORT_ERROR}")
    # cosine 거리 공간으로 명시 — 기존 브라우저 쪽 cosine 유사도 계산과 동일한 지표를 쓰기 위함.
    return _chroma_client.get_or_create_collection(
        name=_safe_collection_name(name), metadata={"hnsw:space": "cosine"}
    )


def _embed_texts(texts, model=None):
    """OpenAI 임베딩 API 호출 헬퍼. /api/embeddings와 /api/vector/* 엔드포인트가 공유합니다.
    반환: (vectors, error_message, status_code) — 성공 시 (vectors, None, None)."""
    if not OPENAI_API_KEY:
        return None, "서버에 OPENAI_API_KEY가 설정되어 있지 않습니다 (.env 확인)", 500

    try:
        resp = requests.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"model": model or OPENAI_EMBEDDING_MODEL_DEFAULT, "input": texts},
            timeout=20,
        )
        data = resp.json()
        if resp.status_code != 200:
            msg = (data.get("error") or {}).get("message", "OpenAI API 오류")
            return None, msg, resp.status_code
        return [d["embedding"] for d in data["data"]], None, None
    except requests.exceptions.RequestException as e:
        return None, str(e), 502


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify(
        {
            "ok": True,
            "openai_key_set": bool(OPENAI_API_KEY),
            "public_data_key_set": bool(PUBLIC_DATA_API_KEY),
            "kakao_javascript_key_set": bool(KAKAO_JAVASCRIPT_KEY),
            "vector_db_available": _chroma_client is not None,
        }
    )


@app.route("/api/chat", methods=["POST"])
def chat():
    """AI 생활상담(consult.html)이 로컬 지식베이스에 없는 질문일 때 호출하는 엔드포인트."""
    if not OPENAI_API_KEY:
        return jsonify({"error": "서버에 OPENAI_API_KEY가 설정되어 있지 않습니다 (.env 확인)"}), 500

    body = request.get_json(force=True, silent=True) or {}
    messages = body.get("messages")
    model = body.get("model") or OPENAI_MODEL_DEFAULT
    if not messages:
        return jsonify({"error": "messages 값이 필요합니다"}), 400

    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"model": model, "messages": messages, "temperature": 0.5, "max_tokens": 500},
            timeout=20,
        )
        data = resp.json()
        if resp.status_code != 200:
            msg = (data.get("error") or {}).get("message", "OpenAI API 오류")
            return jsonify({"error": msg}), resp.status_code

        text = data["choices"][0]["message"]["content"].strip()
        return jsonify({"text": text})
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 502

@app.route("/api/embeddings", methods=["POST"])
def embeddings():
    """
    (하위 호환용) 순수 임베딩 벡터 반환 엔드포인트. 지금은 민원/AI상담 검색이
    아래 /api/vector/upsert, /api/vector/search(ChromaDB 기반)를 사용하므로
    이 엔드포인트는 더 이상 그 기능엔 쓰이지 않지만, 벡터만 필요한 다른 용도를
    위해 남겨둡니다.

    요청:  { "texts": ["문장1", "문장2", ...], "model": "text-embedding-3-small" }
    응답:  { "embeddings": [[...], [...], ...] }   (texts와 같은 순서·개수)
    """
    body = request.get_json(force=True, silent=True) or {}
    texts = body.get("texts")
    model = body.get("model")

    if not isinstance(texts, list) or not texts or not all(isinstance(t, str) for t in texts):
        return jsonify({"error": "texts 값(문자열 배열)이 필요합니다"}), 400
    # 과도한 요청 방지 (KB 전체를 한 번에 보내도 수십 개 수준이라 충분한 상한)
    if len(texts) > 200 or any(len(t) > 4000 for t in texts):
        return jsonify({"error": "texts가 너무 큽니다 (최대 200개, 각 4000자)"}), 400

    vectors, err, status = _embed_texts(texts, model)
    if err:
        return jsonify({"error": err}), status or 500
    return jsonify({"embeddings": vectors})


@app.route("/api/vector/upsert", methods=["POST"])
def vector_upsert():
    """
    ChromaDB 인덱스 생성/갱신. js/embedding.js의 buildIndex(name, items)가
    이 엔드포인트를 호출합니다. 같은 id로 다시 upsert하면 내용이 갱신됩니다.

    요청:  { "collection": "complaint-cats-v1",
             "items": [{"id": "도로·시설물", "text": "..."}, ...],
             "model"?: "text-embedding-3-small" }
    응답:  { "ok": true, "count": N }
    """
    body = request.get_json(force=True, silent=True) or {}
    collection_name = body.get("collection")
    items = body.get("items")
    model = body.get("model")

    if not collection_name or not isinstance(collection_name, str):
        return jsonify({"error": "collection 값이 필요합니다"}), 400
    if not isinstance(items, list) or not items:
        return jsonify({"error": "items(배열)가 필요합니다"}), 400
    if not all(isinstance(it, dict) and it.get("id") not in (None, "") and isinstance(it.get("text"), str) for it in items):
        return jsonify({"error": "items의 각 항목은 {id, text} 형태여야 합니다"}), 400
    if len(items) > 200 or any(len(it["text"]) > 4000 for it in items):
        return jsonify({"error": "items가 너무 큽니다 (최대 200개, 각 4000자)"}), 400

    texts = [it["text"] for it in items]
    vectors, err, status = _embed_texts(texts, model)
    if err:
        return jsonify({"error": err}), status or 500

    try:
        coll = _get_collection(collection_name)
        coll.upsert(ids=[str(it["id"]) for it in items], embeddings=vectors, documents=texts)
    except Exception as e:  # pragma: no cover - chroma 내부 오류 방어
        return jsonify({"error": f"ChromaDB 저장 실패: {e}"}), 500

    return jsonify({"ok": True, "count": len(items)})


@app.route("/api/vector/search", methods=["POST"])
def vector_search():
    """
    ChromaDB 의미 검색. js/embedding.js의 search(name, query, topK)가
    이 엔드포인트를 호출합니다. 해당 컬렉션이 아직 upsert된 적 없으면 빈 결과를 줍니다.

    요청:  { "collection": "complaint-cats-v1", "query": "...", "top_k"?: 3,
             "model"?: "text-embedding-3-small" }
    응답:  { "results": [{"id": "...", "score": 0.83}, ...] }  (score = 코사인 유사도, 높을수록 유사, 내림차순)
    """
    body = request.get_json(force=True, silent=True) or {}
    collection_name = body.get("collection")
    query = body.get("query")
    top_k = body.get("top_k") or 3
    model = body.get("model")

    if not collection_name or not isinstance(collection_name, str):
        return jsonify({"error": "collection 값이 필요합니다"}), 400
    if not query or not isinstance(query, str):
        return jsonify({"error": "query 값이 필요합니다"}), 400

    vectors, err, status = _embed_texts([query], model)
    if err:
        return jsonify({"error": err}), status or 500

    try:
        coll = _get_collection(collection_name)
        count = coll.count()
        if count == 0:
            return jsonify({"results": []})
        res = coll.query(query_embeddings=[vectors[0]], n_results=min(int(top_k), count))
    except Exception as e:  # pragma: no cover - chroma 내부 오류 방어
        return jsonify({"error": f"ChromaDB 검색 실패: {e}"}), 500

    ids = (res.get("ids") or [[]])[0]
    distances = (res.get("distances") or [[]])[0]
    # cosine 공간에서 chroma가 주는 distance = 1 - 코사인유사도이므로 다시 유사도로 환산
    results = [{"id": i, "score": 1 - d} for i, d in zip(ids, distances)]
    return jsonify({"results": results})


@app.route("/api/kakao-map-key", methods=["GET"])
def kakao_map_key():
    if not KAKAO_JAVASCRIPT_KEY:
        return jsonify({"error": "서버에 KAKAO_JAVASCRIPT_KEY가 설정되어 있지 않습니다 (.env 확인)"}), 500

    return jsonify({"javascriptKey": KAKAO_JAVASCRIPT_KEY})

@app.route("/api/public-data", methods=["GET"])
def public_data_proxy():
    """
    공공데이터포털(data.go.kr) Open API 범용 프록시.
    프론트엔드(js/api.js)는 serviceKey 없이 이 엔드포인트로 요청을 보내고,
    이 서버가 .env의 PUBLIC_DATA_API_KEY를 붙여 대신 호출해줍니다.

    사용 예:
      /api/public-data?endpoint=https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus&numOfRows=10
    """
    if not PUBLIC_DATA_API_KEY:
        return jsonify({"error": "서버에 PUBLIC_DATA_API_KEY가 설정되어 있지 않습니다 (.env 확인)"}), 500

    endpoint = request.args.get("endpoint")
    if not endpoint:
        return jsonify({"error": "endpoint 파라미터가 필요합니다"}), 400

    params = request.args.to_dict()
    params.pop("endpoint", None)
    # 미세먼지(에어코리아 ArpltnInforInqireSvc) 호출만 별도 키(AIRKOREA_API_KEY)가
    # .env에 설정돼 있으면 그 키를 쓴다 — 내가 신청한 키가 아니라 다른 사람 키가
    # PUBLIC_DATA_API_KEY에 잘못 들어가 있던 문제 때문에 임시로 분리해둔 것.
    if AIRKOREA_API_KEY and "ArpltnInforInqireSvc" in (endpoint or ""):
        service_key = AIRKOREA_API_KEY
    else:
        service_key = PUBLIC_DATA_API_KEY
    # .env에 "일반 인증키(Encoding)"을 넣은 경우 requests가 한 번 더 인코딩해서
    # 이중 인코딩(%2B → %252B)이 되는 것을 방지 — %가 있으면 먼저 디코딩해준다.
    if "%" in service_key:
        service_key = unquote(service_key)
    params["serviceKey"] = service_key

    try:
        resp = requests.get(endpoint, params=params, timeout=15)
        return (
            resp.content,
            resp.status_code,
            {"Content-Type": resp.headers.get("Content-Type", "application/json")},
        )
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 502


if __name__ == "__main__":
    app.run(
        host=os.getenv("FLASK_HOST", "127.0.0.1"),
        port=int(os.getenv("FLASK_PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "false").lower() == "true",
    )
