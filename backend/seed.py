import json
import os
from sqlalchemy.orm import Session
from backend.database import SessionLocal, engine, Base
from backend.models import Document, Page, Shape, Audio

def load_json_data(filepath: str):
    with open(filepath, 'r') as f:
        return json.load(f)

def seed_data():
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    try:
        # Check if data already exists to avoid duplication
        if db.query(Document).first():
            print("Data already seeded.")
            return

        # Load Document Data
        # Assuming running from project root.
        # Updated path to backend/mocks as requested
        mock_data_path = os.path.join("backend", "mocks", "beautiful_mock_data.json")
        if not os.path.exists(mock_data_path):
             # Fallback relative path check
             mock_data_path = os.path.join("mocks", "beautiful_mock_data.json")
        
        if not os.path.exists(mock_data_path):
            print(f"Warning: Mock data not found at {mock_data_path}")
            return

        doc_data = load_json_data(mock_data_path)
        
        document = Document(id=doc_data["id"])
        db.add(document)
        
        for page_data in doc_data["pages"]:
            page = Page(
                id=page_data["id"],
                document_id=document.id,
                width=page_data["width"],
                height=page_data["height"],
                background=page_data["background"]
            )
            db.add(page)
            
            for shape_data in page_data["shapes"]:
                # Extract common fields
                common_fields = ["kind", "x", "y", "width", "height", "rotate"]
                properties = {k: v for k, v in shape_data.items() if k not in common_fields}
                
                shape = Shape(
                    page_id=page.id,
                    kind=shape_data["kind"],
                    x=shape_data["x"],
                    y=shape_data["y"],
                    width=shape_data["width"],
                    height=shape_data["height"],
                    rotate=shape_data["rotate"],
                    properties=properties
                )
                db.add(shape)
        
        # Load Audio Data
        audio_data_path = os.path.join("backend", "mocks", "audio.json")
        if not os.path.exists(audio_data_path):
             audio_data_path = os.path.join("mocks", "audio.json")
        
        if os.path.exists(audio_data_path):
            audio_list = load_json_data(audio_data_path)
            for audio_item in audio_list:
                audio = Audio(url=audio_item["url"])
                db.add(audio)
        else:
            print(f"Warning: Audio mock data not found at {audio_data_path}")
            
        db.commit()
        print("Seeding completed successfully.")
        
    except Exception as e:
        print(f"Error seeding data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
