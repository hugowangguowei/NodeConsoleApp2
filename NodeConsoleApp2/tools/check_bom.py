import glob
import pathlib
import codecs


def detect_bom(b: bytes) -> str:
    if b.startswith(codecs.BOM_UTF8):
        return "UTF8-BOM"
    if b.startswith(codecs.BOM_UTF16_LE):
        return "UTF16-LE-BOM"
    if b.startswith(codecs.BOM_UTF16_BE):
        return "UTF16-BE-BOM"
    return "NONE"


for f in glob.glob("NodeConsoleApp2/assets/data/*.json"):
    p = pathlib.Path(f)
    b = p.read_bytes()
    print(f"{p.name}: bom={detect_bom(b)} first4={b[:4].hex()} size={len(b)}")
