"""Request/response bodies for /auth endpoints.

Field rules mirror the original signup/login/reset forms so client and server agree.
"""

from typing import Annotated, Literal, Self

from pydantic import AfterValidator, BaseModel, EmailStr, Field, StringConstraints, model_validator

from app.core.password_policy import MAX_LENGTH, password_problems


def _strong_password(value: str) -> str:
    problems = password_problems(value)
    if problems:
        raise ValueError(" ".join(problems))
    return value


# Old signup form: letters, digits and spaces only.
Name = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=255, pattern=r"^[A-Za-z0-9 ]+$"
    ),
]
Password = Annotated[str, Field(min_length=1, max_length=MAX_LENGTH)]
NewPassword = Annotated[str, Field(max_length=MAX_LENGTH), AfterValidator(_strong_password)]


class SignupRequest(BaseModel):
    name: Name
    email: EmailStr
    password: NewPassword

    @model_validator(mode="after")
    def _not_similar_to_identity(self) -> Self:
        if password_problems(self.password, name=self.name, email=str(self.email)):
            raise ValueError("Password is too similar to your name or email.")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: Password


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105  (OAuth2 token type)
    expires_in: int = Field(description="Access token lifetime in seconds.")


class UidTokenRequest(BaseModel):
    uid: str = Field(max_length=64)
    token: str = Field(max_length=1024)


class ActivationRequest(UidTokenRequest):
    pass


class EmailRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(UidTokenRequest):
    new_password: NewPassword
    re_new_password: Password

    @model_validator(mode="after")
    def _passwords_match(self) -> Self:
        if self.new_password != self.re_new_password:
            raise ValueError("Passwords do not match.")
        return self
