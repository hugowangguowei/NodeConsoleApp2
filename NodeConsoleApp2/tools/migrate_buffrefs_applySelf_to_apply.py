import json
import sys
from pathlib import Path


def migrate_skill(skill: dict) -> bool:
    changed = False

    buff_refs = skill.get("buffRefs")
    if not isinstance(buff_refs, dict):
        return False

    apply_list = buff_refs.get("apply")
    if not isinstance(apply_list, list):
        apply_list = []
        buff_refs["apply"] = apply_list
        changed = True

    apply_self = buff_refs.get("applySelf")
    if isinstance(apply_self, list) and len(apply_self) > 0:
        for row in apply_self:
            if not isinstance(row, dict):
                continue
            migrated = dict(row)
            migrated["target"] = "self"
            apply_list.append(migrated)
        changed = True

    if "applySelf" in buff_refs:
        del buff_refs["applySelf"]
        changed = True

    remove_list = buff_refs.get("remove")
    if remove_list is None:
        buff_refs["remove"] = []
        changed = True

    return changed


def migrate_pack(pack: dict) -> tuple[bool, int]:
    skills = pack.get("skills")
    if not isinstance(skills, list):
        raise ValueError("Invalid pack: missing skills[]")

    changed_any = False
    changed_count = 0

    for skill in skills:
        if not isinstance(skill, dict):
            continue
        if migrate_skill(skill):
            changed_any = True
            changed_count += 1

    return changed_any, changed_count


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: migrate_buffrefs_applySelf_to_apply.py <skills_pack.json>", file=sys.stderr)
        return 2

    path = Path(sys.argv[1])
    pack = json.loads(path.read_text(encoding="utf-8"))

    changed, count = migrate_pack(pack)

    if changed:
        path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"changed={str(changed).lower()} skills_updated={count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
