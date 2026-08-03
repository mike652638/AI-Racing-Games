"""最终冒烟测试：验证 10 个优化 Task 的实际效果（无人值守）"""
from playwright.sync_api import sync_playwright
import time
import os

OUT_DIR = r"D:\AI\AI-Racing-Games\shots\final-test"
os.makedirs(OUT_DIR, exist_ok=True)


def screenshot(page, name):
    path = os.path.join(OUT_DIR, f"{name}.png")
    page.screenshot(path=path)
    print(f"Screenshot: {path}")
    return path


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path=r"C:\Users\ZCL\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe",
        )
        # ============ 单屏模式 ============
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto("http://localhost:5175/")
        page.wait_for_load_state("networkidle")
        time.sleep(1.0)
        screenshot(page, "01-menu")  # Task3: 菜单无 HUD 残留；按钮文字

        # 赛道切换预览（Task8）：按 2/3 各截图
        page.keyboard.press("Digit2")
        time.sleep(1.2)
        screenshot(page, "02-menu-track2")
        page.keyboard.press("Digit3")
        time.sleep(1.2)
        screenshot(page, "03-menu-track3")
        page.keyboard.press("Digit1")
        time.sleep(1.2)
        screenshot(page, "04-menu-track1-back")

        # 开始比赛
        page.keyboard.press("Space")
        time.sleep(0.8)
        screenshot(page, "05-racing-start")  # Task2: 车流尺寸

        # 加速驾驶（速度上限验证）
        page.keyboard.down("w")
        time.sleep(3.0)
        screenshot(page, "06-driving-fast")  # Task2: 树木/车辆尺寸、速度
        page.keyboard.up("w")

        # 暂停（HUD 在暂停时显示）
        page.keyboard.press("Escape")
        time.sleep(0.5)
        screenshot(page, "07-paused")
        page.keyboard.press("Escape")
        time.sleep(0.5)

        # ============ 分屏模式（Task4） ============
        page2 = browser.new_page(viewport={"width": 1280, "height": 720})
        page2.goto("http://localhost:5175/?split=1")
        page2.wait_for_load_state("networkidle")
        time.sleep(1.0)
        screenshot(page2, "08-split-menu")  # Task4: 左右两区域都有预览
        page2.keyboard.press("Space")
        time.sleep(0.8)
        screenshot(page2, "09-split-racing-start")
        # P1 加速、P2 不加速 -> 画面/速度独立
        page2.keyboard.down("w")
        time.sleep(2.5)
        screenshot(page2, "10-split-driving-p1only")
        page2.keyboard.up("w")
        # P2 加速、P1 不加速
        page2.keyboard.down("ArrowUp")
        time.sleep(2.5)
        screenshot(page2, "11-split-driving-p2only")
        page2.keyboard.up("ArrowUp")

        browser.close()


if __name__ == "__main__":
    main()
