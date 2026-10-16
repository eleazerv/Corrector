""" signed URL diganti ke host yang bisa dibuka browser."""
from core.config import settings
from providers.storage import supabase_storage as ss


def test_public_url_replaces_internal_host(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "http://host.docker.internal:54321")
    monkeypatch.setattr(settings, "SUPABASE_PUBLIC_URL", "http://localhost:54321/")
    url = "http://host.docker.internal:54321/storage/v1/object/sign/b/a.jpg?token=x"
    assert ss._public(url) == "http://localhost:54321/storage/v1/object/sign/b/a.jpg?token=x"


def test_public_url_unset_keeps_url(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_PUBLIC_URL", None)
    assert ss._public("http://host.docker.internal:54321/x") == "http://host.docker.internal:54321/x"
