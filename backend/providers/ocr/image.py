from PIL import Image , ImageOps , UnidentifiedImageError
import io 
from .base import PermanentOcrError 


def load_image(image_bytes: bytes, max_side : int ) -> Image.Image : 
    """
    bytes -> PIL Image yang udah diproses untuk ocr
        1. buka ( gagal -> PermanentOcrError , retry ga guna )
        2. putar sesuai EXIF ( foto hp sering miring )
        3. ubah ke RGB 
        4. perkecil kalau sisi terlalu panjang ( buat hemat vram dan token )
    """
    
    try: 
        img = Image.open(io.BytesIO(image_bytes))
        img.load()
        
    except (UnidentifiedImageError, OSError) as e : 
        raise PermanentOcrError(f"failed to load image:{e}") from e
    
    # putar sesuai EXIF ( foto hp sering miring ) exif tuh kek foto landscape ( 90 derajat gitu)
    img = ImageOps.exif_transpose(img)
    if img.mode != "RGB" : 
        img = img.convert("RGB")
    
    if max(img.size) > max_side : 
        img.thumbnail((max_side,max_side), Image.Resampling.LANCZOS)
    return img 


def to_jpeg_bytes(img : Image.Image, quality: int = 90) -> bytes : 
    buf = io.BytesIO()
    img.save (buf,format="JPEG",quality=quality)
    return buf.getvalue()        