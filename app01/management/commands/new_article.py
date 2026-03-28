from datetime import date
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils.text import slugify


class Command(BaseCommand):
    help = "Create a markdown article file with title/date/tags front matter."

    def add_arguments(self, parser):
        parser.add_argument(
            "slug",
            nargs="?",
            help="Article slug (filename without .md). If omitted, it is generated from --title.",
        )
        parser.add_argument(
            "--title",
            default="",
            help="Article title. Default is empty.",
        )
        parser.add_argument(
            "--tags",
            default="",
            help="Comma-separated tags. Default is empty.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite existing file if it already exists.",
        )

    def handle(self, *args, **options):
        raw_slug = (options.get("slug") or "").strip()
        title = (options.get("title") or "").strip()
        tags = (options.get("tags") or "").strip()
        force = bool(options.get("force"))

        if not raw_slug:
            if not title:
                raise CommandError("Provide either <slug> or --title.")
            raw_slug = title

        slug = slugify(raw_slug, allow_unicode=True).strip("-")
        if not slug:
            raise CommandError("Could not generate a valid slug from input.")

        articles_dir = Path(settings.BASE_DIR) / "content" / "articles"
        articles_dir.mkdir(parents=True, exist_ok=True)
        file_path = articles_dir / f"{slug}.md"

        if file_path.exists() and not force:
            raise CommandError(f"File already exists: {file_path}. Use --force to overwrite.")

        front_matter = (
            f"title: {title}\n"
            f"date: {date.today().isoformat()}\n"
            f"tags: {tags}\n\n"
        )
        file_path.write_text(front_matter, encoding="utf-8")

        relative_path = file_path.relative_to(settings.BASE_DIR)
        self.stdout.write(self.style.SUCCESS(f"Created: {relative_path}"))
