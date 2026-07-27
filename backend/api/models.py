from datetime import datetime
from sqlalchemy import BigInteger, Boolean, Column, Float, ForeignKey, Integer, String, TIMESTAMP, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False, unique=True)
    username = Column(String(100), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=True)
    google_id = Column(String(255), nullable=True, unique=True, index=True)
    xp = Column(BigInteger, default=0)
    level = Column(BigInteger, default=1)
    taste_profile = Column(Text, nullable=True)
    is_admin = Column(Boolean, nullable=False, default=False)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    visits = relationship("Visit", back_populates="user")
    xp_history = relationship("XpHistory", back_populates="user")
    user_badges = relationship("UserBadge", back_populates="user")
    trips = relationship("Trip", back_populates="user")
    comments = relationship("Comment", back_populates="user", foreign_keys="Comment.user_id")
    ratings = relationship("Rating", back_populates="user")
    monument_tags = relationship("MonumentTag", back_populates="user")


class Monument(Base):
    __tablename__ = "monuments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    description = Column(String)
    city = Column(String(100))
    category = Column(String(100), default="monument")
    latitude = Column(Float)
    longitude = Column(Float)
    osm_id = Column(BigInteger, unique=True, nullable=True, index=True)
    source = Column(BigInteger)
    embedding = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    visits = relationship("Visit", back_populates="monument")
    images = relationship("MonumentImage", back_populates="monument", cascade="all, delete-orphan")
    trip_monuments = relationship("TripMonument", back_populates="monument")
    themes = relationship("MonumentTheme", back_populates="monument", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="monument", cascade="all, delete-orphan")
    ratings = relationship("Rating", back_populates="monument", cascade="all, delete-orphan")
    monument_tags = relationship("MonumentTag", back_populates="monument", cascade="all, delete-orphan")


class Visit(Base):
    __tablename__ = "visits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    monument_id = Column(BigInteger, ForeignKey("monuments.id"), nullable=False)
    gpt_lat = Column(Float)
    gps_lon = Column(Float)
    visited_at = Column(TIMESTAMP, default=datetime.utcnow)

    user = relationship("User", back_populates="visits")
    monument = relationship("Monument", back_populates="visits")


class Badge(Base):
    __tablename__ = "badges"

    id = Column(Integer, primary_key=True, autoincrement=True)
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

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    action = Column(String(255))
    xp = Column(BigInteger)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    user = relationship("User", back_populates="xp_history")


class MonumentImage(Base):
    __tablename__ = "monument_images"

    id = Column(Integer, primary_key=True, autoincrement=True)
    monument_id = Column(BigInteger, ForeignKey("monuments.id"), nullable=False)
    image_url = Column(Text, nullable=False)

    monument = relationship("Monument", back_populates="images")


class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(String, nullable=True)
    start_date = Column(TIMESTAMP, nullable=True)
    end_date = Column(TIMESTAMP, nullable=True)
    status = Column(String(50), default="planned")
    use_days = Column(Boolean, nullable=False, default=False)
    day_count = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    user = relationship("User", back_populates="trips")
    trip_monuments = relationship("TripMonument", back_populates="trip", cascade="all, delete-orphan")


class TripMonument(Base):
    __tablename__ = "trip_monuments"

    trip_id = Column(BigInteger, ForeignKey("trips.id"), primary_key=True)
    monument_id = Column(BigInteger, ForeignKey("monuments.id"), primary_key=True)
    order = Column(BigInteger, default=0)
    day = Column(Integer, nullable=True)
    is_visited = Column(Boolean, default=False)
    added_at = Column(TIMESTAMP, default=datetime.utcnow)

    trip = relationship("Trip", back_populates="trip_monuments")
    monument = relationship("Monument", back_populates="trip_monuments")


class MonumentTheme(Base):
    __tablename__ = "monuments_theme"

    id = Column(Integer, primary_key=True, autoincrement=True)
    monument_id = Column(BigInteger, ForeignKey("monuments.id"), nullable=False)
    theme = Column(String(100), nullable=False)
    confidence = Column(Float, nullable=False)

    monument = relationship("Monument", back_populates="themes")

    __table_args__ = (UniqueConstraint("monument_id", "theme", name="uq_monument_theme"),)


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    monument_id = Column(BigInteger, ForeignKey("monuments.id"), nullable=False)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    # visible | pending_review (masqué, en attente de modération) | removed
    status = Column(String(20), nullable=False, default="visible")
    ai_score = Column(Float, nullable=True)
    ai_flagged_at = Column(TIMESTAMP, nullable=True)
    moderated_by = Column(BigInteger, ForeignKey("users.id"), nullable=True)
    moderated_at = Column(TIMESTAMP, nullable=True)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    monument = relationship("Monument", back_populates="comments")
    user = relationship("User", back_populates="comments", foreign_keys=[user_id])


class Rating(Base):
    __tablename__ = "ratings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    monument_id = Column(BigInteger, ForeignKey("monuments.id"), nullable=False)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    is_positive = Column(Boolean, nullable=False)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)
    updated_at = Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow)

    monument = relationship("Monument", back_populates="ratings")
    user = relationship("User", back_populates="ratings")


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    label = Column(String(100), nullable=False, unique=True)
    emoji = Column(String(10), nullable=False)
    # positive | neutral | negative
    sentiment = Column(String(20), nullable=False, default="neutral")
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    monument_tags = relationship("MonumentTag", back_populates="tag", cascade="all, delete-orphan")


class MonumentTag(Base):
    __tablename__ = "monument_tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    monument_id = Column(BigInteger, ForeignKey("monuments.id"), nullable=False)
    tag_id = Column(BigInteger, ForeignKey("tags.id"), nullable=False)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    monument = relationship("Monument", back_populates="monument_tags")
    tag = relationship("Tag", back_populates="monument_tags")
    user = relationship("User", back_populates="monument_tags")
