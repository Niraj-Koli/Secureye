"""Account endpoints: signup, activation, login, token refresh, logout, password reset."""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status

from app.api.deps import AuthServiceDep, EmailSenderDep, SettingsDep
from app.core.config import Settings
from app.core.rate_limit import rate_limit
from app.core.security import TokenPurpose
from app.schemas.auth import (
    ActivationRequest,
    EmailRequest,
    LoginRequest,
    PasswordResetConfirmRequest,
    SignupRequest,
    TokenResponse,
)
from app.schemas.user import UserRead
from app.services import auth_emails
from app.services.auth import InvalidRefreshTokenError, Session
from app.services.email import send_safely

router = APIRouter(prefix="/auth", tags=["auth"])

# The refresh cookie is only sent to these endpoints, never to the rest of the API.
_REFRESH_COOKIE_PATH_SUFFIX = "/auth"


def _set_refresh_cookie(response: Response, session: Session, settings: Settings) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=session.refresh_token,
        max_age=settings.refresh_token_ttl_days * 24 * 3600,
        path=settings.api_v1_prefix + _REFRESH_COOKIE_PATH_SUFFIX,
        httponly=True,
        secure=settings.use_secure_cookies,
        samesite="lax",
    )


def _clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=settings.api_v1_prefix + _REFRESH_COOKIE_PATH_SUFFIX,
        httponly=True,
        secure=settings.use_secure_cookies,
        samesite="lax",
    )


def _token_response(session: Session) -> TokenResponse:
    return TokenResponse(access_token=session.access.token, expires_in=session.access.expires_in)


def _refresh_cookie(request: Request, settings: SettingsDep) -> str | None:
    return request.cookies.get(settings.refresh_cookie_name)


RefreshCookie = Annotated[str | None, Depends(_refresh_cookie)]


@router.post(
    "/signup",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account and email an activation link",
    dependencies=[Depends(rate_limit("5/minute"))],
)
async def signup(
    body: SignupRequest,
    auth: AuthServiceDep,
    settings: SettingsDep,
    email_sender: EmailSenderDep,
    background: BackgroundTasks,
) -> UserRead:
    user = await auth.signup(body)
    uid, token = auth.one_time_token(user, TokenPurpose.ACTIVATION)
    background.add_task(
        send_safely, email_sender, auth_emails.activation_email(user, uid, token, settings)
    )
    return UserRead.model_validate(user)


@router.post(
    "/activate",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Activate an account from the emailed link",
    dependencies=[Depends(rate_limit("10/minute"))],
)
async def activate(body: ActivationRequest, auth: AuthServiceDep) -> None:
    await auth.activate(body.uid, body.token)


@router.post(
    "/activate/resend",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Resend the activation email",
    description="Always returns 202 so the response doesn't reveal which emails are registered.",
    dependencies=[Depends(rate_limit("3/minute"))],
)
async def resend_activation(
    body: EmailRequest,
    auth: AuthServiceDep,
    settings: SettingsDep,
    email_sender: EmailSenderDep,
    background: BackgroundTasks,
) -> None:
    user = await auth.inactive_user_by_email(body.email)
    if user is not None:
        uid, token = auth.one_time_token(user, TokenPurpose.ACTIVATION)
        background.add_task(
            send_safely, email_sender, auth_emails.activation_email(user, uid, token, settings)
        )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Exchange email + password for an access token (refresh token set as cookie)",
    dependencies=[Depends(rate_limit("10/minute"))],
)
async def login(
    body: LoginRequest, auth: AuthServiceDep, settings: SettingsDep, response: Response
) -> TokenResponse:
    user = await auth.authenticate(body.email, body.password)
    session = await auth.start_session(user)
    _set_refresh_cookie(response, session, settings)
    return _token_response(session)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Rotate the refresh cookie and issue a new access token",
    dependencies=[Depends(rate_limit("30/minute"))],
)
async def refresh(
    auth: AuthServiceDep, settings: SettingsDep, response: Response, refresh_token: RefreshCookie
) -> TokenResponse:
    if not refresh_token:
        raise InvalidRefreshTokenError("Session expired. Please log in again.")
    session = await auth.refresh_session(refresh_token)
    _set_refresh_cookie(response, session, settings)
    return _token_response(session)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke the current session and clear the refresh cookie",
)
async def logout(
    auth: AuthServiceDep, settings: SettingsDep, response: Response, refresh_token: RefreshCookie
) -> None:
    await auth.end_session(refresh_token)
    _clear_refresh_cookie(response, settings)


@router.post(
    "/password-reset",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Email a password reset link",
    description="Always returns 202 so the response doesn't reveal which emails are registered.",
    dependencies=[Depends(rate_limit("5/minute"))],
)
async def request_password_reset(
    body: EmailRequest,
    auth: AuthServiceDep,
    settings: SettingsDep,
    email_sender: EmailSenderDep,
    background: BackgroundTasks,
) -> None:
    user = await auth.active_user_by_email(body.email)
    if user is not None:
        uid, token = auth.one_time_token(user, TokenPurpose.PASSWORD_RESET)
        background.add_task(
            send_safely, email_sender, auth_emails.password_reset_email(user, uid, token, settings)
        )


@router.post(
    "/password-reset/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Set a new password from the emailed link (signs out all sessions)",
    dependencies=[Depends(rate_limit("10/minute"))],
)
async def confirm_password_reset(
    body: PasswordResetConfirmRequest,
    auth: AuthServiceDep,
    settings: SettingsDep,
    email_sender: EmailSenderDep,
    background: BackgroundTasks,
    response: Response,
) -> None:
    user = await auth.reset_password(body.uid, body.token, body.new_password)
    _clear_refresh_cookie(response, settings)
    background.add_task(
        send_safely, email_sender, auth_emails.password_changed_email(user, settings)
    )
