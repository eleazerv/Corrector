"""Kalkulator aman untuk pipeline (TANPA eval()).

Dipakai node `check_calculations`: LLM menulis ekspresi yang perlu dicek, file ini yang MENGHITUNG.

Dua mesin:
1. ANGKA (jenis "angka")  -> evaluate(): AST sendiri, instan, jalan di proses yang sama.
       evaluate("150/12") -> 12.5       evaluate("2 × 9,8") -> 19.6
       sin/cos/tan pakai DERAJAT (soal fisika SMA/kuliah dasar).
2. SIMBOLIK (SymPy)       -> check_symbolic(): turunan, turunan parsial, integral tak tentu,
       integral tentu, limit, aljabar (sama bentuk), persamaan.
       sin/cos/tan pakai RADIAN (konvensi kalkulus).
       Jalan di PROSES TERPISAH dengan timeout (run_symbolic), karena SymPy bisa lama/hang
       dan thread tidak bisa dibunuh. Proses anak yang macet di-terminate lalu dibuat ulang.

Keamanan: teks TIDAK PERNAH masuk eval()/sympify()/parse_expr() (ketiganya pakai eval di dalam).
Teks di-parse pakai ast.parse (hanya parsing, tidak menjalankan) lalu tiap node diubah SENDIRI
ke objek SymPy. Node/nama di luar daftar putih -> ditolak.
"""


import ast 
import atexit 
import math 
import multiprocessing as mp 
import operator 
import random
import re 
import threading 

# angka doank 
MAX_POWER = 12          # 9**9**9 bikin server hang -> tolak pangkat besar
MAX_LEN = 200    
_OPS = { 
    ast.Add: operator.add , ast.Sub : operator.sub , ast.Mult: operator.mul ,
    ast.Div: operator.truediv ,ast.Pow: operator.pow , ast.USub: operator.neg,
    ast.UAdd : operator.pos    
}

_FUNCS = {
    "sqrt": math.sqrt,
    "sin": lambda x: math.sin(math.radians(x)),     # input derajat
    "cos": lambda x: math.cos(math.radians(x)),
    "tan": lambda x: math.tan(math.radians(x)),
    "log": math.log10,
    "ln": math.log,
    "abs": abs,
}

def _normalize(expr: str) -> str:
    """Tulisan manusia -> sintaks Python (khusus mesin ANGKA)."""
    s = (expr or "").strip()
    s = s.replace("×", "*").replace("·", "*").replace("÷", "/").replace("−", "-").replace("^", "**")
    s = re.sub(r"(?<=\d),(?=\d)", ".", s)                    # 2,5   -> 2.5
    s = re.sub(r"√\s*\(?([0-9\.]+)\)?", r"sqrt(\1)", s)      # √16   -> sqrt(16)
    return s


def _eval(node):
    """Telusuri pohon AST. Apa pun di luar daftar -> ValueError."""
    if isinstance(node, ast.Expression):
        return _eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) \
            and not isinstance(node.value, bool):
        return float(node.value)
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        left, right = _eval(node.left), _eval(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > MAX_POWER:
            raise ValueError("pangkat terlalu besar")
        return _OPS[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.operand))
    if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
            and node.func.id in _FUNCS and len(node.args) == 1 and not node.keywords):
        return _FUNCS[node.func.id](_eval(node.args[0]))
    raise ValueError("bukan ekspresi angka")

def evaluate(expr: str) -> float | None:
    """Hitung ekspresi angka. Gagal / tidak aman / bukan angka -> None."""
    s = _normalize(expr)
    if not s or len(s) > MAX_LEN or not re.search(r"\d", s):
        return None
    try:
        value = _eval(ast.parse(s, mode="eval"))
    except (SyntaxError, ValueError, ZeroDivisionError, OverflowError, TypeError, RecursionError):
        return None
    return value if math.isfinite(value) else None


def is_close(a: float, b: float) -> bool:
    """Sama kalau selisih <= 0.2% atau <= 0.011 (pembulatan wajar, mis. 1/3 = 0.33)."""
    return math.isclose(a, b, rel_tol=2e-3, abs_tol=0.011)


# SYMPY
KIND_ALIASES = {
    "angka": "angka", "number": "angka", "numeric": "angka", "arithmetic": "angka",
    "sama": "sama", "algebra": "sama", "aljabar": "sama", "equivalent": "sama", "simplify": "sama",
    "persamaan": "persamaan", "equation": "persamaan", "solve": "persamaan",
    "turunan": "turunan", "derivative": "turunan", "diff": "turunan",
    "turunan_parsial": "turunan_parsial", "partial_derivative": "turunan_parsial", "partial": "turunan_parsial",
    "integral": "integral", "integral_tak_tentu": "integral", "indefinite_integral": "integral",
    "antiderivative": "integral",
    "integral_tentu": "integral_tentu", "definite_integral": "integral_tentu",
    "limit": "limit", "lim": "limit",
}
SYMBOLIC_KINDS = set(KIND_ALIASES.values()) - {"angka"}



def normalize_kind(raw) -> str | None:
    """'Definite Integral' / 'definite-integral' / 'integral_tentu' -> 'integral_tentu'. Tak dikenal -> None."""
    key = str(raw or "angka").strip().lower().replace(" ", "_").replace("-", "_")
    return KIND_ALIASES.get(key)


SYM_MAX_LEN = 300
SYM_MAX_POWER = 60           # x**60 masih wajar; 2**(10**6) tidak
_GREEK = {"alpha", "beta", "gamma", "theta", "phi", "lam", "mu", "omega", "tau", "rho"}
_NO_ANSWER = {"tidak ada", "tidak-ada", "tidak_ada", "dne", "tak ada", "tidak terdefinisi"}

def _sym_tables():
    """Nama yang boleh dipakai. Dibuat lazy supaya import SymPy hanya terjadi di proses anak."""
    import sympy as sp
    funcs = {
        "sin": sp.sin, "cos": sp.cos, "tan": sp.tan, "sec": sp.sec, "csc": sp.csc, "cot": sp.cot,
        "asin": sp.asin, "acos": sp.acos, "atan": sp.atan,
        "arcsin": sp.asin, "arccos": sp.acos, "arctan": sp.atan,
        "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh,
        "exp": sp.exp, "ln": sp.log, "log": lambda x: sp.log(x, 10),
        "sqrt": sp.sqrt, "abs": sp.Abs,
    }
    consts = {"pi": sp.pi, "e": sp.E, "E": sp.E, "oo": sp.oo, "inf": sp.oo}
    return sp, funcs, consts


def _sym_normalize(text: str) -> str:
    """Tulisan -> sintaks Python. BEDA dengan mesin angka: koma TIDAK diubah jadi titik
    (prompt meminta desimal pakai titik), dan perkalian implisit '2x' / ')(' ditambah '*'."""
    s = (text or "").strip()
    s = (s.replace("×", "*").replace("·", "*").replace("÷", "/").replace("−", "-")
          .replace("^", "**").replace("√", "sqrt").replace("π", "pi").replace("∞", "oo"))
    s = re.sub(r"(?<=\d)\s*(?=[A-Za-z(])", "*", s)          # 2x -> 2*x, 3(x+1) -> 3*(x+1)
    s = re.sub(r"\)\s*(?=[A-Za-z0-9(])", ")*", s)           # (x+1)(x-1) -> (x+1)*(x-1)
    return s

def _check_chars(s: str) -> None:
    if not s or len(s) > SYM_MAX_LEN:
        raise ValueError("ekspresi kosong / terlalu panjang")
    if not re.fullmatch(r"[A-Za-z0-9_+\-*/().\s]+", s) or "__" in s:
        raise ValueError("karakter tidak diizinkan")


def _to_sympy(node, T):
    """AST -> objek SymPy. Hanya node di daftar putih; tanpa eval."""
    sp, funcs, consts = T
    if isinstance(node, ast.Expression):
        return _to_sympy(node.body, T)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) \
            and not isinstance(node.value, bool):
        if isinstance(node.value, int):
            return sp.Integer(node.value)
        # 0.2 -> Float (bukan pecahan) supaya same() tahu mahasiswa membulatkan
        return sp.Float(repr(node.value), 15)
    if isinstance(node, ast.Name):
        name = node.id
        if name in consts:
            return consts[name]
        if len(name) == 1 or name in _GREEK:
            return sp.Symbol(name)
        raise ValueError(f"nama tidak dikenal: {name}")
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        v = _to_sympy(node.operand, T)
        return -v if isinstance(node.op, ast.USub) else v
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        a, b = _to_sympy(node.left, T), _to_sympy(node.right, T)
        if isinstance(node.op, ast.Pow):
            if b.is_number and b.is_finite and abs(complex(b)) > SYM_MAX_POWER:
                raise ValueError("pangkat terlalu besar")
            if not b.is_number and a.is_number and a.is_finite and abs(complex(a)) > 1e6:
                raise ValueError("basis terlalu besar")
            return a ** b
        return {ast.Add: operator.add, ast.Sub: operator.sub,
                ast.Mult: operator.mul, ast.Div: operator.truediv}[type(node.op)](a, b)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and not node.keywords:
        name = node.func.id
        args = [_to_sympy(a, T) for a in node.args]
        if name in funcs and len(args) == 1:
            return funcs[name](args[0])
        if len(name) == 1 and len(args) == 1:           # x(x+1) = x*(x+1)
            return sp.Symbol(name) * args[0]
        raise ValueError(f"fungsi tidak diizinkan: {name}")
    raise ValueError(f"sintaks tidak diizinkan: {type(node).__name__}")

def parse_sym(text: str, T=None):
    """String -> ekspresi SymPy (aman). Gagal -> ValueError."""
    T = T or _sym_tables()
    s = _sym_normalize(text)
    _check_chars(s)
    try:
        tree = ast.parse(s, mode="eval")
    except SyntaxError as e:
        raise ValueError("sintaks salah") from e
    return _to_sympy(tree, T)

def _has_float(expr) -> bool:
    import sympy as sp
    return any(isinstance(a, sp.Float) for a in sp.preorder_traversal(expr))


def _num(expr) -> complex | None:
    """"
    ubah object SymPy -> angka kompleks. Gagal / tidak aman / bukan angka -> None
    """
    try:
        v = complex(expr.evalf(15))
    except (TypeError, ValueError, ZeroDivisionError, OverflowError):
        return None
    if not (math.isfinite(v.real) and math.isfinite(v.imag)):
        return None
    return v

def _near(x: complex, y: complex, loose: bool) -> bool:
    if loose:          # mahasiswa menulis desimal -> toleransi pembulatan
        return is_close(x.real, y.real) and is_close(x.imag, y.imag)
    return abs(x - y) <= 1e-8 * (1 + abs(x) + abs(y))


def same(a, b) -> bool | None:
    """Apakah a ≡ b? True / False / None (tidak bisa diputuskan).
    Cara: tanpa simbol -> bandingkan angka. Ada simbol -> uji di beberapa titik acak
    (cepat & tidak bisa hang seperti simplify). Beda di satu titik saja sudah pasti tidak sama."""
    import sympy as sp
    if a.has(sp.oo, -sp.oo, sp.zoo) or b.has(sp.oo, -sp.oo, sp.zoo):
        return bool(a == b)
    loose = _has_float(b) or _has_float(a)
    syms = sorted(a.free_symbols | b.free_symbols, key=str)
    if not syms:
        x, y = _num(a), _num(b)
        return None if x is None or y is None else _near(x, y, loose)
    rng = random.Random(12345)                  # deterministik: hasil sama tiap dijalankan
    ok_points = 0
    for _ in range(12):
        pt = {s: sp.Float(rng.uniform(0.3, 2.7), 15) for s in syms}   # positif: aman untuk ln/sqrt
        x, y = _num(a.subs(pt)), _num(b.subs(pt))
        if x is None or y is None:
            continue
        if not _near(x, y, loose):
            return False
        ok_points += 1
        if ok_points >= 5:
            return True
    return None

def _pick_var(item: dict, f, T):
    """Variabel utama: dari item["variabel"], atau satu-satunya simbol di f, atau x.
       LLM akan mention variabel nya 
    """
    sp = T[0]
    vs = item.get("variabel") or []
    if vs:
        return sp.Symbol(vs[0])
    free = sorted(f.free_symbols, key=str)
    return free[0] if len(free) == 1 else sp.Symbol("x")

def _numeric_integral(sp, f, x, a, b):
    """Integral tentu secara numerik (cepat). Presisi jelek (mis. divergen) -> None."""
    v = sp.Integral(f, (x, a, b)).evalf(15)
    if not v.is_Number or (isinstance(v, sp.Float) and v._prec < 40):
        return None
    return v

def _fmt(expr) -> str:
    """Ubah hasil SymPy jadi teks yang mudah dibaca dosen & grader LLM (disimpan di hasil_program).

    1. Istilah SymPy -> istilah Indonesia : log(2) -> ln(2), E -> e
    2. Angka eksak tidak bulat -> + desimal: ln(2) -> "ln(2) ≈ 0.693147"
       (bilangan bulat/pecahan, variabel, tak hingga, dan bilangan imajiner dibiarkan)
    3. Desimal panjang -> 6 digit penting : 0.158863175338671 -> "0.158863"
    4. Teks > 300 karakter dipotong (hemat token prompt)
    """
    import sympy as sp
    s = re.sub(r"\blog\(", "ln(", str(expr))
    s = re.sub(r"\bE\b", "e", s)
    if isinstance(expr, sp.Expr) and expr.is_number and not expr.is_Rational and not expr.has(sp.oo, sp.zoo):
        v = _num(expr)
        if v is not None and abs(v.imag) < 1e-12 and not isinstance(expr, sp.Float):
            s += f" ≈ {v.real:.6g}"
        elif isinstance(expr, sp.Float):
            s = f"{float(expr):.6g}"
    return s if len(s) <= 300 else s[:297] + "..."


def check_symbolic(item: dict) -> dict:
    """Hitung 1 item simbolik. DIPANGGIL DI PROSES ANAK.
    Return {"hasil_program": str|None, "cocok": bool|None} atau {"error": "..."}."""
    T = _sym_tables()
    sp = T[0]
    kind = item["jenis"]
    exact = item.get("_exact", True)     # False = mode cepat (dipakai ulang setelah timeout)
    try:
        written_raw = (item.get("ditulis") or "").strip()
        if kind == "persamaan":
            return _check_equation(item, written_raw, T)

        f = parse_sym(item["ekspresi"], T)
        no_answer = written_raw.lower() in _NO_ANSWER
        written = parse_sym(written_raw, T) if written_raw and not no_answer else None

        if kind == "sama":                       # aljabar: dua bentuk setara?
            hasil = sp.simplify(f) if exact else f
            cocok = None if written is None else same(f, written)

        elif kind in ("turunan", "turunan_parsial"):
            vs = [sp.Symbol(v) for v in (item.get("variabel") or [])] or [_pick_var(item, f, T)]
            hasil = sp.diff(f, *vs)
            cocok = None if written is None else same(hasil, written)

        elif kind == "integral":                 # tak tentu: cek dengan MENURUNKAN jawaban
            x = _pick_var(item, f, T)
            hasil = sp.integrate(f, x) if exact else None
            if hasil is not None and hasil.has(sp.Integral):
                hasil = None                     # SymPy tidak sanggup; cek turunan tetap jalan
            cocok = None if written is None else same(sp.diff(written, x), f)   # +C otomatis hilang

        elif kind == "integral_tentu":
            x = _pick_var(item, f, T)
            a, b = parse_sym(str(item["batas_bawah"]), T), parse_sym(str(item["batas_atas"]), T)
            hasil = sp.integrate(f, (x, a, b)) if exact else None
            if hasil is None or hasil.has(sp.Integral):     # tak ada bentuk tertutup -> numerik
                hasil = _numeric_integral(sp, f, x, a, b)
            cocok = None if written is None or hasil is None else same(hasil, written)

        elif kind == "limit":
            x = _pick_var(item, f, T)
            point = parse_sym(str(item["menuju"]), T)
            arah = item.get("arah") if item.get("arah") in ("+", "-") else "+-"
            if point.has(sp.oo):
                arah = "-" if point == sp.oo else "+"
            try:
                hasil = sp.limit(f, x, point, dir=arah)
                exists = not isinstance(hasil, sp.AccumBounds) and not hasil.has(sp.Limit)
            except ValueError:                   # limit kiri != kanan
                hasil, exists = None, False
            if no_answer:
                cocok = not exists
            elif written is None:
                cocok = None
            else:
                cocok = False if not exists else same(hasil, written)
            if not exists:
                return {"hasil_program": "tidak ada", "cocok": cocok}
        else:
            return {"error": f"jenis tidak dikenal: {kind}"}

        return {"hasil_program": None if hasil is None else _fmt(hasil), "cocok": cocok}
    except (ValueError, TypeError, ZeroDivisionError, RecursionError, NotImplementedError,
            AttributeError, KeyError, OverflowError) as e:
        return {"error": f"{type(e).__name__}: {e}"[:200]}




def _check_equation(item: dict, written_raw: str, T) -> dict:
    """Persamaan, mis. ekspresi "x**2 - 5*x + 6 = 0", ditulis "2; 3" (akar dipisah ';')."""
    sp = T[0]
    parts = item["ekspresi"].split("=")
    if len(parts) > 2:
        raise ValueError("lebih dari satu '='")
    lhs = parse_sym(parts[0], T)
    eq = lhs - parse_sym(parts[1], T) if len(parts) == 2 else lhs
    x = _pick_var(item, eq, T)
    sol = sp.solveset(eq, x, domain=sp.S.Reals)
    roots = [parse_sym(r, T) for r in re.split(r";|\batau\b", written_raw) if r.strip()] \
        if written_raw else []
    if isinstance(sol, sp.FiniteSet):
        hasil = "; ".join(_fmt(r) for r in sol) or "tidak ada solusi real"
        if not written_raw:
            return {"hasil_program": hasil, "cocok": None}
        if written_raw.lower() in _NO_ANSWER:
            return {"hasil_program": hasil, "cocok": len(sol) == 0}
        matched = [any(same(s, r) for r in roots) for s in sol]
        extra = [not any(same(s, r) for s in sol) for r in roots]
        return {"hasil_program": hasil, "cocok": all(matched) and not any(extra)}
    # himpunan tak hingga (mis. trig) -> cukup cek akar mahasiswa memenuhi persamaan
    if not roots:
        return {"hasil_program": _fmt(sol), "cocok": None}
    checks = [same(eq.subs(x, r), sp.Integer(0)) for r in roots]
    return {"hasil_program": _fmt(sol), "cocok": None if None in checks else all(checks)}



# proses anak + timeout

_pool = None
_pool_lock = threading.Lock()      # 1 pemakai pool sekaligus -> timeout satu item tidak
                                   # ikut membunuh item soal lain


def _warmup() -> None:
    import sympy  # noqa: F401  (import sekali saat proses anak lahir)


def _get_pool():
    global _pool
    if _pool is None:
        # "spawn": aman walau proses induk punya thread (asyncio.to_thread) & sama di Windows/Linux
        _pool = mp.get_context("spawn").Pool(processes=1, initializer=_warmup, maxtasksperchild=200)
    return _pool


def _kill_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.terminate()
        _pool.join()
        _pool = None


atexit.register(_kill_pool)


def run_symbolic(items: list[dict], timeout: float = 3.0, budget: float = 20.0) -> list[dict]:
    """Jalankan check_symbolic untuk tiap item di proses anak.
    Item > timeout detik -> proses anak dibunuh & dibuat ulang, item itu {"error": "timeout"}.
    Total > budget detik -> sisa item {"error": "budget habis"}.
    BLOCKING: dari kode async panggil lewat asyncio.to_thread(run_symbolic, ...)."""
    import time
    out = []
    with _pool_lock:
        start = time.monotonic()
        for it in items:
            if time.monotonic() - start > budget:
                out.append({"error": "budget habis"})
                continue
            try:
                out.append(_get_pool().apply_async(check_symbolic, (it,)).get(timeout))
            except mp.TimeoutError:
                _kill_pool()
                # coba sekali lagi TANPA bentuk eksak (integrate/simplify) -> biasanya cepat
                try:
                    fast = {**it, "_exact": False}
                    out.append(_get_pool().apply_async(check_symbolic, (fast,)).get(timeout))
                except mp.TimeoutError:
                    _kill_pool()
                    out.append({"error": "timeout"})
            except Exception as e:           # proses anak mati, pickling, dll.
                _kill_pool()
                out.append({"error": f"{type(e).__name__}: {e}"[:200]})
    return out
