from fastapi import FastAPI
from sentence_transformers import SentenceTransformer

app = FastAPI(title="AI Recommendation API")
model = SentenceTransformer("all-MiniLM-L6-v2")

@app.post("/embed")
def embed(text: str):
    vector = model.encode(text).tolist()
    return {"embedding": vector}
