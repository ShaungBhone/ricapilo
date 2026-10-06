"""Public discovery through the pinned bilibili-cli client; no account cookies."""
import asyncio
import json
import sys

from bili_cli.client import get_hot_videos, search_video


async def main():
    if sys.argv[1] == "hot":
        data = await get_hot_videos(pn=1, ps=50)
        items = data.get("list", [])
    elif sys.argv[1] == "search":
        items = await search_video(sys.argv[2], page=1)
    else:
        raise ValueError("Unsupported operation")
    print(json.dumps({"ok": True, "items": items}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        asyncio.run(asyncio.wait_for(main(), timeout=25))
    except Exception:
        print(json.dumps({"ok": False}))
        sys.exit(1)
