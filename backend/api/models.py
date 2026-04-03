from datetime import datetime
from sqlalchemy import BigInteger, Column, Float, ForeignKey, String, TIMESTAMP
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False, unique=True)
    username = Column(String(100), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    xp = Column(BigInteger, default=0)
    level = Column(BigInteger, default=1)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    visits = relationship("Visit", back_populates="user")
    xp_history = relationship("XpHistory", back_populates="user")
    user_badges = relationship("UserBadge", back_populates="user")


class Monument(Base):
    __tablename__ = "monuments"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    description = Column(String)
    city = Column(String(100))
    category = Column(String(100), default="monument")
    latitude = Column(Float)
    longitude = Column(Float)
    source = Column(BigInteger)
    embedding = Column(BigInteger)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    visits = relationship("Visit", back_populates="monument")


class Visit(Base):
    __tablename__ = "visits"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    monument_id = Column(BigInteger, ForeignKey("monuments.id"), nullable=False)
    gpt_lat = Column(Float)
    gps_lon = Column(Float)
    visited_at = Column(TIMESTAMP, default=datetime.utcnow)

    user = relationship("User", back_populates="visits")
    monument = relationship("Monument", back_populates="visits")


class Badge(Base):
    __tablename__ = "badges"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    description = Column(String)
    icon_url = Column(String(500))

    user_badges = relationship("UserBadge", back_populates="badge")


class UserBadge(Base):
    __tablename__ = "user_badges"

    user_id = Column(BigInteger, ForeignKey("users.id"), primary_key=True)
    badge_id = Column(BigInteger, ForeignKey("badges.id"), primary_key=True)
    earned_at = Column(TIMESTAMP, default=datetime.utcnow)

    user = relationship("User", back_populates="user_badges")
    badge = relationship("Badge", back_populates="user_badges")


class XpHistory(Base):
    __tablename__ = "xp_history"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    action = Column(String(255))
    xp = Column(BigInteger)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    user = relationship("User", back_populates="xp_history")


class MonumentTheme(Base):
    __tablename__ = "monuments_theme"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    theme = Column(String(100))
    confidence = Column(Float)
