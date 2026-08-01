#!/usr/bin/env python3
"""
Script to render the Palmeiras Calendar HTML template as a PNG image.
Supports customization of month, year, days, and matches.
"""

import sys
import json
import subprocess
from pathlib import Path

def render_calendar_to_png(
    output_path: str = "calendar.png",
    month: str = "ABRIL",
    year: str = "2026",
    days_in_month: int = 30,
    first_day_of_week: int = 2,
    matches: list = None,
    width: int = 1080,
    height: int = 1350
):
    """
    Render the calendar template to PNG using Puppeteer.
    
    Args:
        output_path: Path where the PNG will be saved
        month: Month name (e.g., "ABRIL", "MAIO")
        year: Year (e.g., "2026")
        days_in_month: Number of days in the month
        first_day_of_week: First day of week (0=Sunday, 1=Monday, etc.)
        matches: List of match dictionaries with 'day', 'homeTeam', 'awayTeam'
        width: Image width in pixels
        height: Image height in pixels
    """
    
    if matches is None:
        matches = [
            {"day": 5, "homeTeam": "Palmeiras", "awayTeam": "Corinthians"},
            {"day": 12, "homeTeam": "Palmeiras", "awayTeam": "São Paulo"},
            {"day": 19, "homeTeam": "Flamengo", "awayTeam": "Palmeiras"},
        ]
    
    # Get the directory of this script
    script_dir = Path(__file__).parent
    html_file = script_dir / "calendar-template.html"
    
    if not html_file.exists():
        print(f"Error: HTML template not found at {html_file}")
        return False
    
    # Create a Node.js script to render the HTML
    render_script = script_dir / "render_temp.mjs"
    
    script_content = f"""
import puppeteer from 'puppeteer';
import path from 'path';
import {{ fileURLToPath }} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, 'calendar-template.html');
const outputPath = path.join(__dirname, '{output_path}');

(async () => {{
    const browser = await puppeteer.launch({{
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }});
    
    const page = await browser.newPage();
    
    // Set viewport to match the calendar dimensions
    await page.setViewport({{
        width: {width},
        height: {height},
        deviceScaleFactor: 1
    }});
    
    // Load the HTML file
    await page.goto('file://' + htmlPath, {{ waitUntil: 'networkidle0' }});
    
    // Update calendar with custom values
    await page.evaluate((month, year, daysInMonth, firstDayOfWeek, matches) => {{
        window.updateCalendar(month, year, daysInMonth, firstDayOfWeek, matches);
    }}, '{month}', '{year}', {days_in_month}, {first_day_of_week}, {json.dumps(matches)});
    
    // Wait a bit for rendering
    await page.waitForTimeout(500);
    
    // Take screenshot
    await page.screenshot({{
        path: outputPath,
        type: 'png',
        fullPage: true,
        omitBackground: false
    }});
    
    console.log('Calendar rendered to: ' + outputPath);
    
    await browser.close();
}})();
"""
    
    with open(render_script, 'w') as f:
        f.write(script_content)
    
    try:
        # Run the Node.js script
        result = subprocess.run(
            ['node', str(render_script)],
            cwd=str(script_dir),
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            print(f"Error rendering calendar: {result.stderr}")
            return False
        
        print(result.stdout)
        
        # Check if the output file was created
        output_file = script_dir / output_path
        if output_file.exists():
            print(f"✓ Calendar successfully rendered to: {output_file}")
            print(f"  Size: {output_file.stat().st_size / 1024:.1f} KB")
            return True
        else:
            print(f"Error: Output file not created at {output_file}")
            return False
    
    except subprocess.TimeoutExpired:
        print("Error: Rendering timed out")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False
    finally:
        # Clean up the temporary script
        if render_script.exists():
            render_script.unlink()


def main():
    """Main entry point for the script."""
    
    if len(sys.argv) > 1:
        # Parse command line arguments
        output_path = sys.argv[1] if len(sys.argv) > 1 else "calendar.png"
        month = sys.argv[2] if len(sys.argv) > 2 else "ABRIL"
        year = sys.argv[3] if len(sys.argv) > 3 else "2026"
        
        success = render_calendar_to_png(
            output_path=output_path,
            month=month,
            year=year
        )
    else:
        # Default rendering
        print("Calendar Creator Renderer")
        print("=" * 50)
        print("\nUsage: python3 render_calendar.py [output_path] [month] [year]")
        print("\nExample: python3 render_calendar.py calendar_abril_2026.png ABRIL 2026")
        print("\nRendering default calendar (ABRIL 2026)...")
        
        success = render_calendar_to_png(
            output_path="calendar_abril_2026.png",
            month="ABRIL",
            year="2026"
        )
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
