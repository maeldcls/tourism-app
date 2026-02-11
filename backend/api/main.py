from fastapi import FastAPI

app = FastAPI(title="Tourism API")

@app.get("/")
def root():
    return {"message": "API is running"}
