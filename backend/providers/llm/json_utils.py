import json 
import re 

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def parse_json_object(text:str) -> dict | None : 
    """Parse output LLM jadi dict. Toleran ke ```json fence & teks di luar {...}.
    Return None kalau tetap gagal.
    contoh : 
    ```json          ← AWAL (dihapus regex)
   {"data": ...}    ← isi JSON (dipertahankan)
   ```              ← AKHIR (dihapus regex)
    """
    if not text : 
        return 
    s = _FENCE.sub("", text.strip())
    try : 
        data = json.loads(s)
        return data if isinstance(data,dict) else None
    except json.JSONDecodeError: 
        pass 
    
    start , end = s.find("{"), s.rfind("}") 
    if start == -1 or end <= start: 
        return None 
    try : 
        data = json.loads(s[start:end+1])
        return data if isinstance(data,dict) else None
    except json.JSONDecodeError: 
        return None
    