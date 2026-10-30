# The semantic API's development image: Python and the exact packages in uv.lock.
# The code itself is not copied in: compose.yaml mounts the project read-only, so edits apply at once.
FROM python:3.13.17-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv \
    PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PATH="/opt/venv/bin:$PATH"

WORKDIR /opt/explorer
COPY pyproject.toml uv.lock .python-version ./
# Includes the test tools (pytest, httpx): this image is for development and testing.
RUN uv sync --frozen --no-install-project

# Run as an ordinary user, not root.
RUN useradd --system --uid 10001 explorer
USER explorer
WORKDIR /project/api
EXPOSE 8000
CMD ["python", "-m", "explorer.serve"]
