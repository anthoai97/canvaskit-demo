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
        # Define mock files to load
        mock_files = [
            "beautiful_mock_data.json",
            "stress_test.json"
        ]

        for mock_file in mock_files:
            mock_data_path = os.path.join("backend", "mocks", mock_file)
            if not os.path.exists(mock_data_path):
                 mock_data_path = os.path.join("mocks", mock_file)
            
            if not os.path.exists(mock_data_path):
                print(f"Warning: Mock data not found at {mock_data_path}")
                continue

            doc_data = load_json_data(mock_data_path)
            doc_id = doc_data["id"]
            
            # Check if document already exists
            existing_doc = db.query(Document).filter(Document.id == doc_id).first()
            if existing_doc:
                print(f"Document {doc_id} from {mock_file} already exists. Skipping.")
                continue

            print(f"Seeding document {doc_id} from {mock_file}...")
            document = Document(id=doc_id)
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
            print(f"Successfully seeded document {doc_id}.")

        # Load Audio Data
        if not db.query(Audio).first():
            audio_data_path = os.path.join("backend", "mocks", "audio.json")
            if not os.path.exists(audio_data_path):
                 audio_data_path = os.path.join("mocks", "audio.json")
            
            if os.path.exists(audio_data_path):
                audio_list = load_json_data(audio_data_path)
                for audio_item in audio_list:
                    audio = Audio(url=audio_item["url"])
                    db.add(audio)
                print("Seeded audio data.")
            else:
                print(f"Warning: Audio mock data not found at {audio_data_path}")
        else:
            print("Audio data already exists. Skipping.")
            
        db.commit()
        print("Seeding completed successfully.")
        
    except Exception as e:
        print(f"Error seeding data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
