from sqlalchemy.orm import Session
from backend.models import Document, Audio, Shape

def get_document_data(db: Session, document_id: str) -> tuple[dict | None, list[bytes]]:
    """
    Fetches document data and returns a tuple:
    1. The document structure (JSON-serializable dict), with images having their URLs.
    2. An empty list (no longer preloading images to binary).
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        return None, []
    
    pages_data = []

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
            
            # Images now keep their URLs - frontend will load them directly

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
    
    return doc_structure, []

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

def create_shape(db: Session, page_id: str, data: dict) -> dict | None:
    # Extract known columns
    kind = data.get("kind", "text") # Default to text if not specified, though it should be
    x = data.get("x", 0)
    y = data.get("y", 0)
    width = data.get("width", 100)
    height = data.get("height", 100)
    rotate = data.get("rotate", 0)
    
    # Everything else goes into properties
    # We exclude the columns we already extracted to avoid duplication, 
    # but for simplicity in this demo we can just dump everything else or specific known props.
    # Let's filter out the main columns from properties.
    properties = {k: v for k, v in data.items() if k not in ["id", "kind", "x", "y", "width", "height", "rotate"]}
    
    new_shape = Shape(
        page_id=page_id,
        kind=kind,
        x=x,
        y=y,
        width=width,
        height=height,
        rotate=rotate,
        properties=properties
    )
    
    db.add(new_shape)
    db.commit()
    db.refresh(new_shape)
    
    # Return the full shape data as the frontend expects it (merged)
    shape_dict = {
        "id": new_shape.id,
        "kind": new_shape.kind,
        "x": new_shape.x,
        "y": new_shape.y,
        "width": new_shape.width,
        "height": new_shape.height,
        "rotate": new_shape.rotate,
    }
    if new_shape.properties:
        shape_dict.update(new_shape.properties)
        
    return shape_dict
