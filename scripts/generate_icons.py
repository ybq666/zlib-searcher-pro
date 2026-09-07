import os
from PIL import Image, ImageDraw, ImageFont

icons_dir = r"d:\yao\toy\adds_on\public\icons"
os.makedirs(icons_dir, exist_ok=True)

sizes = [16, 32, 48, 128]

for size in sizes:
    # Create image with transparent background
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Rounded rectangle background with gradient or deep blue/teal color
    # Base background: Deep Z-Library Blue #1A5276 or #0F4C81
    margin = max(1, size // 16)
    radius = size // 4
    
    # Draw rounded background
    bg_color = (20, 90, 160, 255) # Indigo / Ocean Blue
    draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=radius,
        fill=bg_color
    )
    
    # Inner accent border
    if size >= 32:
        draw.rounded_rectangle(
            [margin + 1, margin + 1, size - margin - 1, size - margin - 1],
            radius=radius,
            outline=(80, 160, 240, 180),
            width=max(1, size // 32)
        )

    # Draw a stylized 'Z' letter or book emblem
    # We will draw a bold clean 'Z' in white with gold/cyan accent
    z_color = (255, 255, 255, 255)
    accent_color = (245, 175, 55, 255) # Gold dot or bar
    
    w = size
    # Define coords for 'Z'
    x1 = int(w * 0.28)
    x2 = int(w * 0.72)
    y1 = int(w * 0.25)
    y2 = int(w * 0.75)
    thickness = max(2, int(w * 0.12))
    
    # Top bar
    draw.rectangle([x1, y1, x2, y1 + thickness], fill=z_color)
    # Bottom bar
    draw.rectangle([x1, y2 - thickness, x2, y2], fill=accent_color)
    
    # Diagonal line
    # Draw polygon for diagonal with width
    d_x1, d_y1 = x2 - thickness // 2, y1 + thickness
    d_x2, d_y2 = x1 + thickness // 2, y2 - thickness
    draw.line([(x2 - thickness // 2, y1), (x1 + thickness // 2, y2)], fill=z_color, width=thickness)
    
    icon_path = os.path.join(icons_dir, f"icon-{size}.png")
    img.save(icon_path, "PNG")
    print(f"Saved: {icon_path}")

print("All icons generated successfully!")
