from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from .database import Base


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    keitaro_id = Column(Integer, unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    alias = Column(String(255), nullable=False)
    geo_code = Column(String(10), nullable=True)

    domain_id = Column(Integer, nullable=True)
    domain_name = Column(String(255), nullable=True)
    group_id = Column(Integer, nullable=True)
    group_name = Column(String(255), nullable=True)
    traffic_source_id = Column(Integer, nullable=True)
    traffic_source_name = Column(String(255), nullable=True)

    initial_offer_id = Column(Integer, nullable=True)

    google_stream_id = Column(Integer, nullable=True)
    offers_stream_id = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
