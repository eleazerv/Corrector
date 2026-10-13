FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /backend
COPY requirements.txt requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt
COPY . .
RUN useradd --create-home appuser
USER appuser
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

