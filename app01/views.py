import json
import os
import re
from calendar import Calendar, monthrange
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from django.conf import settings
from django.http import Http404
from django.shortcuts import render

SITE_PROFILE = {
    "nickname": "Micah Hale",
    "avatar_text": "M",
}

FALLBACK_STEAM_GAMES = [
    {
        "name": "Hades",
        "playtime_hours": 48.0,
        "recent_hours": 2.5,
        "cover_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/header.jpg",
    },
    {
        "name": "Stardew Valley",
        "playtime_hours": 76.0,
        "recent_hours": 0.0,
        "cover_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/413150/header.jpg",
    },
    {
        "name": "Sekiro: Shadows Die Twice",
        "playtime_hours": 30.0,
        "recent_hours": 0.0,
        "cover_url": "https://cdn.cloudflare.steamstatic.com/steam/apps/814380/header.jpg",
    },
]

ARTICLES_DIR = Path(settings.BASE_DIR) / "content" / "articles"
REVIEWS_DIR = Path(settings.BASE_DIR) / "content" / "reviews"
BOOK_COVERS_DIR = Path(settings.BASE_DIR) / "app01" / "static" / "app01" / "book-covers"
BOOK_COVER_EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg", ".svg"]
DEFAULT_STEAM_ID = "76561199562793160"
DEFAULT_STEAM_API_KEY = "AC3041003A2637706ED711881CE3A5D9"
STEAM_MONTHLY_FILE = Path(settings.BASE_DIR) / "content" / "steam" / "monthly_hours.json"
ARTICLE_COVER_BY_SLUG = {
    "django-blog-day-1": "app01/article-covers/cover-django.svg",
    "reading-notes-2026-03": "app01/article-covers/cover-reading.svg",
    "steam-log-method": "app01/article-covers/cover-steam.svg",
}
DEFAULT_ARTICLE_COVER = "app01/article-covers/cover-default.svg"


def _base_context():
    return {
        "profile": SITE_PROFILE,
        "nav_items": [
            {"title": "首页", "url_name": "dashboard", "icon": "home", "active_names": ["dashboard"]},
            {"title": "文章", "url_name": "articles", "icon": "article", "active_names": ["articles", "article_detail"]},
            {"title": "游戏记录", "url_name": "steam", "icon": "gamepad", "active_names": ["steam"]},
            {"title": "书架", "url_name": "bookshelf", "icon": "book", "active_names": ["bookshelf", "book_detail"]},
        ],
    }


def _parse_front_matter(file_path):
    raw_text = file_path.read_text(encoding="utf-8")
    lines = raw_text.splitlines()
    metadata = {}
    body_start_index = 0

    for index, line in enumerate(lines):
        if not line.strip():
            body_start_index = index + 1
            break
        if ":" not in line:
            body_start_index = index
            break
        key, value = line.split(":", 1)
        metadata[key.strip().lower()] = value.strip()
        body_start_index = index + 1

    body = "\n".join(lines[body_start_index:]).strip()
    return metadata, body


def _parse_tags(raw_tags):
    if not raw_tags:
        return []
    return [tag.strip() for tag in re.split(r"[，,]", raw_tags) if tag.strip()]


def _format_month_label(raw_month):
    match = re.match(r"^(\d{4})-(\d{2})$", raw_month)
    if not match:
        return raw_month
    return f"{match.group(1)} 年 {match.group(2)} 月"


def _format_month_compact(raw_month):
    match = re.match(r"^(\d{4})-(\d{2})$", raw_month)
    if not match:
        return raw_month
    return f"{int(match.group(1))}年{int(match.group(2))}月"


def _parse_article_file(file_path):
    metadata, body = _parse_front_matter(file_path)
    summary = metadata.get("summary")
    if not summary:
        compact_body = " ".join(body.split())
        summary = f"{compact_body[:90]}..." if len(compact_body) > 90 else compact_body

    return {
        "slug": file_path.stem,
        "title": metadata.get("title", file_path.stem.replace("-", " ").title()),
        "date": metadata.get("date", "1970-01-01"),
        "summary": summary,
        "content": body,
        "tags": _parse_tags(metadata.get("tags", "")),
    }


def _load_articles(order="desc"):
    if not ARTICLES_DIR.exists():
        return []

    articles = []
    for path in ARTICLES_DIR.glob("*.md"):
        article = _parse_article_file(path)
        article["cover"] = ARTICLE_COVER_BY_SLUG.get(article["slug"], DEFAULT_ARTICLE_COVER)
        try:
            article["mtime"] = path.stat().st_mtime
        except OSError:
            article["mtime"] = 0
        articles.append(article)

    # Primary sort by `date`, secondary sort by file modified time (same-day ordering).
    # In descending mode, newer files on the same date appear first.
    reverse_mode = order != "asc"
    articles.sort(key=lambda item: (item["date"], item.get("mtime", 0)), reverse=reverse_mode)
    return articles


def _find_book_cover(slug):
    for extension in BOOK_COVER_EXTENSIONS:
        cover_path = BOOK_COVERS_DIR / f"{slug}{extension}"
        if cover_path.exists():
            return f"app01/book-covers/{slug}{extension}"
    return "app01/book-covers/default-book.svg"


def _load_books(order="desc"):
    if not REVIEWS_DIR.exists():
        return []

    books = []
    for review_path in REVIEWS_DIR.glob("*.md"):
        if review_path.stem.lower() == "readme":
            continue
        metadata, body = _parse_front_matter(review_path)
        month_raw = metadata.get("month", "未知月份")
        books.append(
            {
                "slug": review_path.stem,
                "title": metadata.get("title", review_path.stem.replace("-", " ").title()),
                "month_raw": month_raw,
                "month_label": _format_month_label(month_raw),
                "cover": _find_book_cover(review_path.stem),
                "tags": _parse_tags(metadata.get("tags", "")) or ["未分类"],
                "review_text": body,
            }
        )

    books.sort(key=lambda item: item["month_raw"], reverse=(order != "asc"))
    return books


def _group_by_month(items, key_name):
    grouped = []
    seen_order = []
    buckets = {}
    for item in items:
        month_key = item[key_name]
        if month_key not in buckets:
            buckets[month_key] = []
            seen_order.append(month_key)
        buckets[month_key].append(item)
    for month_key in seen_order:
        grouped.append(
            {
                "month_raw": month_key,
                "month_label": _format_month_label(month_key),
                "items": buckets[month_key],
            }
        )
    return grouped


def _add_ratio(rows, value_key):
    if not rows:
        return []
    max_value = max(row.get(value_key, 0) for row in rows)
    if max_value <= 0:
        return [{**row, "ratio": 0} for row in rows]
    return [{**row, "ratio": round((row.get(value_key, 0) / max_value) * 100, 2)} for row in rows]


def _resolve_month(raw_month):
    if raw_month and re.match(r"^\d{4}-\d{2}$", raw_month):
        return raw_month
    return date.today().strftime("%Y-%m")


def _collect_available_months(articles, books):
    months = {date.today().strftime("%Y-%m")}
    months.update(article["date"][:7] for article in articles if len(article["date"]) >= 7)
    months.update(book["month_raw"] for book in books if re.match(r"^\d{4}-\d{2}$", book["month_raw"]))
    ordered = sorted(months, reverse=True)
    return [{"value": month, "label": _format_month_label(month)} for month in ordered]


def _build_article_calendar(month_key, month_articles):
    year, month = map(int, month_key.split("-"))
    counts = {}
    for article in month_articles:
        counts[article["date"]] = counts.get(article["date"], 0) + 1

    max_count = max(counts.values()) if counts else 0

    def level_for(count):
        if count <= 0:
            return "none"
        if max_count <= 1:
            return "low"
        ratio = count / max_count
        if ratio < 0.34:
            return "low"
        if ratio < 0.67:
            return "mid"
        return "high"

    cal = Calendar(firstweekday=0)
    weeks = []
    for week in cal.monthdatescalendar(year, month):
        row = []
        for day in week:
            day_str = day.strftime("%Y-%m-%d")
            count = counts.get(day_str, 0)
            row.append(
                {
                    "date": day_str,
                    "day": day.day,
                    "in_month": day.month == month,
                    "count": count,
                    "level": level_for(count),
                }
            )
        weeks.append(row)
    return weeks


def _load_steam_monthly_hours():
    if not STEAM_MONTHLY_FILE.exists():
        return {}
    try:
        payload = json.loads(STEAM_MONTHLY_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _normalize_month_hours(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return round(max(number, 0.0), 1)


def _attach_month_hours(games, month_key):
    monthly_payload = _load_steam_monthly_hours()
    month_bucket = monthly_payload.get(month_key, {})
    if not isinstance(month_bucket, dict):
        month_bucket = {}

    current_month = date.today().strftime("%Y-%m")
    cards = []
    for row in games:
        app_key = str(row.get("app_id", ""))
        name_key = row.get("name", "")
        month_value = None
        if app_key in month_bucket:
            month_value = _normalize_month_hours(month_bucket.get(app_key))
        elif name_key in month_bucket:
            month_value = _normalize_month_hours(month_bucket.get(name_key))

        if month_value is None:
            month_value = row.get("recent_hours", 0.0) if month_key == current_month else 0.0

        item = dict(row)
        item["month_hours"] = round(month_value, 1)
        cards.append(item)
    return cards


def _build_daily_game_chart(month_key, month_games):
    year, month = map(int, month_key.split("-"))
    days_in_month = monthrange(year, month)[1]
    total_by_day = [0.0 for _ in range(days_in_month)]
    max_by_day = [0.0 for _ in range(days_in_month)]
    max_cover_by_day = ["" for _ in range(days_in_month)]
    max_name_by_day = ["" for _ in range(days_in_month)]

    if month_games:
        current_month = date.today().strftime("%Y-%m")
        active_days = list(range(max(days_in_month - 13, 0), days_in_month)) if month_key == current_month else list(range(days_in_month))
        if not active_days:
            active_days = list(range(days_in_month))

        for game_index, game in enumerate(month_games):
            monthly_hours = float(game.get("month_hours", 0) or 0)
            if monthly_hours <= 0:
                continue

            weights = []
            for idx in active_days:
                wave = ((game_index + 3) * (idx + 5)) % 7
                weights.append(1.0 + (wave / 7.0))
            weight_sum = sum(weights)
            if weight_sum <= 0:
                continue

            for i, idx in enumerate(active_days):
                value = monthly_hours * (weights[i] / weight_sum)
                total_by_day[idx] += value
                if value > max_by_day[idx]:
                    max_by_day[idx] = value
                    max_cover_by_day[idx] = game.get("cover_url", "")
                    max_name_by_day[idx] = game.get("name", "")

    max_total = max(total_by_day) if total_by_day else 0
    max_single = max(max_by_day) if max_by_day else 0
    chart_rows = []
    for idx in range(days_in_month):
        total_hours = round(total_by_day[idx], 1)
        max_hours = round(max_by_day[idx], 1)
        chart_rows.append(
            {
                "day": idx + 1,
                "total_hours": total_hours,
                "max_hours": max_hours,
                "total_height": round((total_hours / max_total) * 100, 2) if max_total > 0 else 0,
                "max_height": round((max_hours / max_single) * 100, 2) if max_single > 0 else 0,
                "max_cover_url": max_cover_by_day[idx],
                "max_game_name": max_name_by_day[idx],
            }
        )
    return chart_rows


def _merge_game_free_chart_rows(chart_rows):
    merged = []
    i = 0
    col_width = 64
    col_gap = 20
    total = len(chart_rows)

    while i < total:
        row = chart_rows[i]
        if row.get("total_hours", 0) > 0:
            merged.append({"kind": "day", **row})
            i += 1
            continue

        j = i
        while j < total and chart_rows[j].get("total_hours", 0) <= 0:
            j += 1
        span = j - i

        if span >= 3:
            width_px = span * col_width + (span - 1) * col_gap
            merged.append(
                {
                    "kind": "game_free",
                    "span": span,
                    "width_px": width_px,
                    "start_day": chart_rows[i]["day"],
                    "end_day": chart_rows[j - 1]["day"],
                }
            )
        else:
            for k in range(i, j):
                merged.append({"kind": "day", **chart_rows[k]})
        i = j

    return merged


def _fetch_steam_games(sort_by, month_key):
    def with_ratio(games, sort_mode, selected_month):
        cards = _attach_month_hours(games, selected_month)
        total_hours_sum = sum(item["playtime_hours"] for item in cards)
        month_hours_sum = sum(item.get("month_hours", 0) for item in cards)
        rows = []
        for item in cards:
            card = dict(item)
            card["ratio_total"] = round((item["playtime_hours"] / total_hours_sum) * 100, 2) if total_hours_sum > 0 else 0
            card["ratio_month"] = round((item.get("month_hours", 0) / month_hours_sum) * 100, 2) if month_hours_sum > 0 else 0
            card["ratio"] = card["ratio_month"] if sort_mode == "month" else card["ratio_total"]
            rows.append(card)

        sort_key = "month_hours" if sort_mode == "month" else "playtime_hours"
        rows.sort(key=lambda item: item.get(sort_key, 0), reverse=True)
        return rows

    api_key = os.getenv("STEAM_API_KEY", DEFAULT_STEAM_API_KEY).strip()
    steam_id = os.getenv("STEAM_ID", DEFAULT_STEAM_ID).strip()
    if not api_key or not steam_id:
        return with_ratio(FALLBACK_STEAM_GAMES, sort_by, month_key), "当前显示示例数据。配置 STEAM_API_KEY 和 STEAM_ID 后将自动切换为 Steam 实时数据。"

    endpoint = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/"
    params = {
        "key": api_key,
        "steamid": steam_id,
        "include_appinfo": 1,
        "include_played_free_games": 1,
        "format": "json",
    }
    request_url = f"{endpoint}?{urlencode(params)}"

    try:
        with urlopen(request_url, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (URLError, HTTPError, TimeoutError, json.JSONDecodeError):
        return with_ratio(FALLBACK_STEAM_GAMES, sort_by, month_key), "Steam API 调用失败，当前显示示例数据。"

    game_list = payload.get("response", {}).get("games", [])
    if not game_list:
        return [], "未从 Steam API 获取到游戏数据。"

    cards = []
    for game in game_list:
        app_id = game.get("appid")
        playtime_hours = round(game.get("playtime_forever", 0) / 60, 1)
        recent_hours = round(game.get("playtime_2weeks", 0) / 60, 1)
        cover_url = f"https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/header.jpg"
        cards.append(
            {
                "app_id": app_id,
                "name": game.get("name", f"App {app_id}"),
                "playtime_hours": playtime_hours,
                "recent_hours": recent_hours,
                "cover_url": cover_url,
            }
        )

    return with_ratio(cards, sort_by, month_key), "已加载 Steam API 实时数据。"


def dashboard(request):
    all_articles = _load_articles(order="desc")
    all_books = _load_books(order="desc")
    selected_month = _resolve_month(request.GET.get("month"))
    all_games, _steam_notice = _fetch_steam_games("month", selected_month)

    month_articles = [item for item in all_articles if item["date"].startswith(selected_month)]
    month_books = [item for item in all_books if item["month_raw"] == selected_month]
    month_games = [item for item in all_games if item.get("month_hours", 0) > 0]

    month_game_hours = round(sum(item.get("month_hours", 0) for item in month_games), 1)

    tag_counter = {}
    for article in month_articles:
        tags = article.get("tags") or ["未分类"]
        for tag in tags:
            tag_counter[tag] = tag_counter.get(tag, 0) + 1
    tag_rank = [{"name": name, "value": count} for name, count in sorted(tag_counter.items(), key=lambda x: x[1], reverse=True)[:6]]
    tag_rank = _add_ratio(tag_rank, "value")

    game_rank = [{"name": item["name"], "value": item["month_hours"]} for item in month_games[:8]]
    game_rank = _add_ratio(game_rank, "value")

    selected_day = request.GET.get("day", "")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", selected_day) or not selected_day.startswith(selected_month):
        selected_day = ""

    calendar_weeks = _build_article_calendar(selected_month, month_articles)
    calendar_articles = [item for item in month_articles if item["date"] == selected_day] if selected_day else month_articles
    daily_game_chart = _build_daily_game_chart(selected_month, month_games)
    daily_game_chart_display = _merge_game_free_chart_rows(daily_game_chart)

    selected_day_label = selected_day if selected_day else f"{_format_month_label(selected_month)} 全部文章"
    if request.GET.get("partial") == "day_articles":
        return render(
            request,
            "partials/day_articles_panel.html",
            {
                "selected_day_label": selected_day_label,
                "calendar_articles": calendar_articles,
            },
        )

    axis_max = max((row["total_hours"] for row in daily_game_chart), default=0)
    axis_mid = round(axis_max / 2, 1) if axis_max > 0 else 0
    axis_max = round(axis_max, 1)

    recent_activity = []
    for article in month_articles[:4]:
        recent_activity.append({"kind": "文章", "title": article["title"], "meta": article["date"], "url_name": "article_detail", "slug": article["slug"]})
    for book in month_books[:4]:
        recent_activity.append({"kind": "读书", "title": book["title"], "meta": book["month_label"], "url_name": "book_detail", "slug": book["slug"]})
    for game in month_games[:4]:
        recent_activity.append({"kind": "游戏", "title": game["name"], "meta": f"{game['month_hours']}h / {selected_month}", "url_name": "", "slug": ""})

    context = _base_context()
    context["month_label"] = _format_month_label(selected_month)
    context["month_button_label"] = _format_month_compact(selected_month)
    context["selected_month"] = selected_month
    context["selected_day"] = selected_day
    context["selected_day_label"] = selected_day_label
    context["calendar_weeks"] = calendar_weeks
    context["calendar_articles"] = calendar_articles
    context["daily_game_chart"] = daily_game_chart
    context["daily_game_chart_display"] = daily_game_chart_display
    context["monthly_articles"] = month_articles
    context["monthly_books"] = month_books
    context["monthly_games"] = month_games
    context["stat_total_articles"] = len(all_articles)
    context["stat_total_books"] = len(all_books)
    context["stat_month_articles"] = len(month_articles)
    context["stat_month_books"] = len(month_books)
    context["stat_month_game_hours"] = month_game_hours
    context["stat_active_games"] = len([item for item in month_games if item.get("month_hours", 0) >= 30])
    context["daily_axis_max"] = axis_max
    context["daily_axis_mid"] = axis_mid
    context["tag_rank"] = tag_rank
    context["game_rank"] = game_rank
    context["recent_activity"] = recent_activity
    return render(request, "dashboard.html", context)


def articles(request):
    mode = request.GET.get("mode", "timeline")
    if mode not in {"timeline", "tag"}:
        mode = "timeline"

    order = request.GET.get("order", "desc")
    if order not in {"asc", "desc"}:
        order = "desc"

    article_items = _load_articles(order=order)
    all_tags = sorted({tag for article in article_items for tag in article["tags"]})
    selected_tag = request.GET.get("tag", "all")
    if selected_tag != "all" and selected_tag not in all_tags:
        selected_tag = "all"

    tag_groups = []
    if mode == "tag":
        if not all_tags:
            tag_groups = [{"tag": "未分类", "articles": article_items}]
        elif selected_tag == "all":
            for tag in all_tags:
                tag_groups.append({"tag": tag, "articles": [article for article in article_items if tag in article["tags"]]})
        else:
            tag_groups = [{"tag": selected_tag, "articles": [article for article in article_items if selected_tag in article["tags"]]}]

    timeline_groups = _group_by_month(
        [
            {
                **article,
                "month_raw": article["date"][:7] if len(article["date"]) >= 7 else "未知时间",
            }
            for article in article_items
        ],
        "month_raw",
    )

    context = _base_context()
    context["mode"] = mode
    context["order"] = order
    context["articles"] = article_items
    context["all_tags"] = all_tags
    context["selected_tag"] = selected_tag
    context["tag_groups"] = tag_groups
    context["timeline_groups"] = timeline_groups
    return render(request, "home.html", context)


def article_detail(request, slug):
    article_items = _load_articles(order="desc")
    selected_article = next((item for item in article_items if item["slug"] == slug), None)
    if selected_article is None:
        raise Http404("Article not found.")
    context = _base_context()
    context["article"] = selected_article
    return render(request, "article_detail.html", context)


def steam(request):
    sort_by = request.GET.get("sort", "month")
    if sort_by not in {"total", "month"}:
        sort_by = "month"
    selected_month = _resolve_month(request.GET.get("month"))
    games, steam_notice = _fetch_steam_games(sort_by, selected_month)
    context = _base_context()
    context["games"] = games
    context["steam_notice"] = steam_notice
    context["sort_by"] = sort_by
    context["selected_month"] = selected_month
    context["month_label"] = _format_month_label(selected_month)
    context["month_button_label"] = _format_month_compact(selected_month)
    return render(request, "steam.html", context)


def bookshelf(request):
    mode = request.GET.get("mode", "all")
    if mode not in {"all", "timeline", "tag"}:
        mode = "all"

    order = request.GET.get("order", "desc")
    if order not in {"asc", "desc"}:
        order = "desc"

    books = _load_books(order=order)
    all_tags = sorted({tag for book in books for tag in book.get("tags", [])})
    selected_tag = request.GET.get("tag", "all")
    if selected_tag != "all" and selected_tag not in all_tags:
        selected_tag = "all"

    book_timeline = _group_by_month(books, "month_raw")
    tag_groups = []
    if mode == "tag":
        if not all_tags:
            tag_groups = [{"tag": "未分类", "items": books}]
        elif selected_tag == "all":
            for tag in all_tags:
                tag_groups.append({"tag": tag, "items": [book for book in books if tag in book.get("tags", [])]})
        else:
            tag_groups = [{"tag": selected_tag, "items": [book for book in books if selected_tag in book.get("tags", [])]}]

    context = _base_context()
    context["books"] = books
    context["mode"] = mode
    context["order"] = order
    context["all_tags"] = all_tags
    context["selected_tag"] = selected_tag
    context["tag_groups"] = tag_groups
    context["book_timeline"] = book_timeline
    return render(request, "bookshelf.html", context)


def book_detail(request, slug):
    books = _load_books(order="desc")
    selected_book = next((book for book in books if book["slug"] == slug), None)
    if selected_book is None:
        raise Http404("Book not found.")
    context = _base_context()
    context["book"] = selected_book
    context["review_text"] = selected_book["review_text"]
    return render(request, "book_detail.html", context)
