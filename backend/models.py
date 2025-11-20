from sqlalchemy import Column, Integer, String, Float, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, index=True)
    # Store the full document structure logic if needed, but here we just need the container.
    # The JSON structure implies a document has pages.
    
    pages = relationship("Page", back_populates="document", cascade="all, delete-orphan")

class Page(Base):
    __tablename__ = "pages"

    id = Column(String, primary_key=True, index=True)
    document_id = Column(String, ForeignKey("documents.id"))
    width = Column(Integer)
    height = Column(Integer)
    # Storing background as JSON: {"color": {"r": 255, "g": 255, ...}}
    background = Column(JSON)
    
    document = relationship("Document", back_populates="pages")
    shapes = relationship("Shape", back_populates="page", cascade="all, delete-orphan")

class Shape(Base):
    __tablename__ = "shapes"

    # We'll use a generated ID for database purposes, or use the index/order if strict preservation is needed.
    # The mock data doesn't show IDs for shapes, so we'll add a primary key.
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    page_id = Column(String, ForeignKey("pages.id"))
    
    kind = Column(String) # "text" or "image"
    x = Column(Float)
    y = Column(Float)
    width = Column(Float)
    height = Column(Float)
    rotate = Column(Float, nullable=True)
    
    # Specific properties stored in JSON to allow flexibility (text, fontSize, url, etc.)
    # Includes: text, fontSize, fontFamily, etc. OR url, ratio, etc.
    # Also includes: animation config
    properties = Column(JSON)
    
    page = relationship("Page", back_populates="shapes")

class Audio(Base):
    __tablename__ = "audio"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    url = Column(String)

