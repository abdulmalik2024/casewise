from unittest.mock import patch

from casewise_api import notify


def test_notify_admin_noop_without_key():
    with patch.object(notify.settings, "resend_api_key", ""):
        with patch("casewise_api.notify.httpx.post") as post:
            notify.notify_admin("subject", "text")
    post.assert_not_called()


def test_notify_admin_sends_with_key():
    with patch.object(notify.settings, "resend_api_key", "re_test"):
        with patch("casewise_api.notify.httpx.post") as post:
            notify.notify_admin("New signup: x@y.com", "body")
    assert post.called
    kwargs = post.call_args.kwargs
    assert kwargs["json"]["to"] == ["info@casewise.si"]
    assert kwargs["json"]["subject"] == "New signup: x@y.com"
    assert kwargs["headers"]["Authorization"] == "Bearer re_test"


def test_notify_admin_swallows_http_errors():
    with patch.object(notify.settings, "resend_api_key", "re_test"):
        with patch("casewise_api.notify.httpx.post", side_effect=RuntimeError("down")):
            notify.notify_admin("subject", "text")  # must not raise
