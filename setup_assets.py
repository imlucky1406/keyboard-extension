import os
import shutil
from PIL import Image

src_path = r"C:\Users\lucky\.gemini\antigravity\brain\89c02f61-0f40-485e-9971-c81d9e682349\extension_logo_1785470249927.png"
dest_dir = r"d:\Desktop\python\Keyboard_extension\icons"

if not os.path.exists(dest_dir):
    os.makedirs(dest_dir)

try:
    print(f"Opening source image: {src_path}")
    with Image.open(src_path) as img:
        img.resize((16, 16), Image.Resampling.LANCZOS).save(os.path.join(dest_dir, "icon16.png"))
        img.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(dest_dir, "icon32.png"))
        img.resize((48, 48), Image.Resampling.LANCZOS).save(os.path.join(dest_dir, "icon48.png"))
        img.resize((128, 128), Image.Resampling.LANCZOS).save(os.path.join(dest_dir, "icon128.png"))
    print("Chrome extension icons (16x16, 32x32, 48x48, 128x128) generated successfully in 'icons' folder!")
except ImportError:
    print("Pillow is not installed. Let's install it first.")
except Exception as e:
    print(f"Failed to generate icons: {e}")
