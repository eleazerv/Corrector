import hashlib 
import math 
import re 

class FakeEmbedding :
    """"
    Embedding palsu ,deterministik , tanpa api 
    words di hash ke "dim" bucket lalu dinormalisasikan kata-katanya 
    mirip dapat cosine similarity tinggi. Cukup untuk test alur build_trait.
    """
    
    name = "fake"
    model = "fake_bow"

    def __init__(self,dim:int = 768): 
        self.dim = dim 
        self.calls = 0 
    
    async def start(self) -> None : 
        pass 
    
    async def close(self) -> None : 
        pass 
    
    async def embed(self,texts:list[str])-> list[list[float]] : 
        self.calls += 1 
        return [self._one(t) for t in texts]

    def _one(self, text: str) -> list[float]:
        v = [0.0] * self.dim
        for w in re.findall(r"\w+", text.lower()):
            h = int(hashlib.md5(w.encode()).hexdigest(), 16)
            v[h % self.dim] += 1.0
        n = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / n for x in v]
