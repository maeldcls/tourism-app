"""Génération de codes courts uniques (ex : code ami)."""
import secrets
from sqlalchemy.orm import Session

import models

# Alphabet sans caractères ambigus (0/O, 1/I/L)
_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_CODE_LENGTH = 8


def generate_friend_code(db: Session) -> str:
    while True:
        code = "".join(secrets.choice(_ALPHABET) for _ in range(_CODE_LENGTH))
        if not db.query(models.User).filter(models.User.friend_code == code).first():
            return code
