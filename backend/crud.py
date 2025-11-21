import httpx
from sqlalchemy.orm import Session
from backend.models import Document, Audio, Shape

def get_document_data(db: Session, document_id: str) -> tuple[dict | None, list[bytes]]:
    """
    Fetches document data and returns a tuple:
    1. The document structure (JSON-serializable dict), with images having an 'imageId' placeholder.
    2. A list of raw image bytes, corresponding to the order of 'imageId's.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        return None, []
    
    pages_data = []
    image_blobs = []
    image_count = 0

    for page in document.pages:
        shapes_data = []
        for shape in page.shapes:
            # Merge explicit columns and properties JSON
            shape_dict = {
                "id": shape.id,
                "kind": shape.kind,
                "x": shape.x,
                "y": shape.y,
                "width": shape.width,
                "height": shape.height,
                "rotate": shape.rotate,
            }
            if shape.properties:
                shape_dict.update(shape.properties)
            
            # If it's an image, fetch the content and store as binary
            if shape.kind == "image" and "url" in shape_dict:
                try:
                    # Fetch image synchronously here
                    with httpx.Client() as client:
                        response = client.get(shape_dict["url"])
                        if response.status_code == 200:
                            image_blobs.append(response.content)
                            # Assign a temporary ID to link this shape to the binary blob
                            # The frontend will receive the blobs in order or by ID
                            shape_dict["binaryId"] = image_count
                            image_count += 1
                except Exception as e:
                    print(f"Failed to fetch image for shape {shape.id}: {e}")

            shapes_data.append(shape_dict)

        pages_data.append({
            "id": page.id,
            "width": page.width,
            "height": page.height,
            "background": page.background,
            "shapes": shapes_data
        })
        
    doc_structure = {
        "id": document.id,
        "pages": pages_data
    }
    
    return doc_structure, image_blobs

def get_audio_data(db: Session) -> list[dict]:
    audio_items = db.query(Audio).all()
    return [{"url": item.url} for item in audio_items]

def update_shape(db: Session, shape_id: int, data: dict) -> dict | None:
    shape = db.query(Shape).filter(Shape.id == shape_id).first()
    if not shape:
        return None
    
    if "x" in data:
        shape.x = data["x"]
    if "y" in data:
        shape.y = data["y"]
    if "width" in data:
        shape.width = data["width"]
    if "height" in data:
        shape.height = data["height"]
    if "rotate" in data:
        shape.rotate = data["rotate"]
        
    # Update other properties if needed, but for now focusing on geometry
    
    db.commit()
    db.refresh(shape)
    
    return {
        "id": shape.id,
        "x": shape.x,
        "y": shape.y,
        "width": shape.width,
        "height": shape.height,
        "rotate": shape.rotate
    }
