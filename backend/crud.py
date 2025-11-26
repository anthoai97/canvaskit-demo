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
    
    # Update geometry fields
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
    
    # Update properties (text-specific fields and other custom properties)
    # Extract properties that aren't the main columns
    properties = {k: v for k, v in data.items() if k not in ["id", "x", "y", "width", "height", "rotate"]}
    
    if properties:
        # Merge with existing properties to preserve other fields
        if shape.properties:
            shape.properties.update(properties)
        else:
            shape.properties = properties
        
        # IMPORTANT: Flag the JSON field as modified so SQLAlchemy detects the change
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(shape, "properties")
    
    db.commit()
    db.refresh(shape)
    
    # Return full shape data including properties
    result = {
        "id": shape.id,
        "x": shape.x,
        "y": shape.y,
        "width": shape.width,
        "height": shape.height,
        "rotate": shape.rotate
    }
    
    # Include properties in response
    if shape.properties:
        result.update(shape.properties)
    
    return result

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

def sync_page_shapes(db: Session, page_id: str, shapes_data: list[dict]) -> list[dict]:
    """
    Synchronizes the shapes for a given page with the provided list of shape data.
    - Deletes shapes not in the list.
    - Updates existing shapes.
    - Creates new shapes.
    """
    # 1. Fetch all existing shapes for the page
    existing_shapes = db.query(Shape).filter(Shape.page_id == page_id).all()
    existing_shape_map = {s.id: s for s in existing_shapes}
    
    incoming_ids = set()
    result_shapes = []
    
    # 2. Process incoming shapes (Upsert)
    for shape_data in shapes_data:
        shape_id = shape_data.get("id")
        
        # Extract columns
        kind = shape_data.get("kind", "text")
        x = shape_data.get("x", 0)
        y = shape_data.get("y", 0)
        width = shape_data.get("width", 100)
        height = shape_data.get("height", 100)
        rotate = shape_data.get("rotate", 0)
        
        # Extract properties
        properties = {k: v for k, v in shape_data.items() if k not in ["id", "kind", "x", "y", "width", "height", "rotate"]}
        
        if shape_id and shape_id in existing_shape_map:
            # Update existing
            shape = existing_shape_map[shape_id]
            shape.x = x
            shape.y = y
            shape.width = width
            shape.height = height
            shape.rotate = rotate
            shape.properties = properties
            # Kind usually doesn't change, but let's update it if it does
            shape.kind = kind
            
            incoming_ids.add(shape_id)
            result_shapes.append(shape)
        else:
            # Create new
            # If ID is provided (e.g. from frontend generation), we can try to use it if DB allows.
            # But usually DB autoincrements. 
            # However, for Undo/Redo to work across clients, we might want to respect the ID if possible,
            # OR we accept that IDs might shift and frontend needs to reload.
            # But wait, if we just created a shape in frontend with a temp ID, and now we sync,
            # we want to persist that.
            # For this demo, let's assume we can just create a new one. 
            # If the frontend sends an ID that isn't in DB, it's effectively a "new" shape from DB perspective
            # (maybe it was deleted in DB but frontend undid the delete).
            # We should probably let DB assign ID to be safe, OR force ID if we enabled that.
            # Our Shape model has `id = Column(Integer, primary_key=True, index=True, autoincrement=True)`.
            # We can't easily force ID unless we change schema or use a different strategy.
            # So we'll create a new shape.
            
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
            # We need to flush to get the ID if we want to return it, 
            # but we can't easily map it back to the incoming ID if we don't return a map.
            # For now, let's just add it.
            result_shapes.append(new_shape)
            
    # 3. Delete shapes not in incoming list
    for shape in existing_shapes:
        if shape.id not in incoming_ids:
            # If an incoming shape had an ID that wasn't in DB (e.g. undid a delete), 
            # we created a NEW shape above.
            # The old shape with that ID is already gone (hence not in DB).
            # So we only delete shapes that ARE in DB but NOT in incoming list.
            db.delete(shape)
            
    db.commit()
    
    # Refresh all to get IDs
    for s in result_shapes:
        db.refresh(s)
        
    # Return formatted data
    formatted_shapes = []
    for s in result_shapes:
        s_dict = {
            "id": s.id,
            "kind": s.kind,
            "x": s.x,
            "y": s.y,
            "width": s.width,
            "height": s.height,
            "rotate": s.rotate,
        }
        if s.properties:
            s_dict.update(s.properties)
        formatted_shapes.append(s_dict)
        
    return formatted_shapes
