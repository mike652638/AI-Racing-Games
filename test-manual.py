from playwright.sync_api import sync_playwright
import time
import os

OUT_DIR = r"D:\AI\AI-Racing-Games\shots\manual-test"
os.makedirs(OUT_DIR, exist_ok=True)


def screenshot(page, name):
    path = os.path.join(OUT_DIR, f"{name}.png")
    page.screenshot(path=path)
    print(f"Screenshot: {path}")
    return path


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto("http://localhost:5175/")
        page.wait_for_load_state("networkidle")

        # 1. 初始启动画面
        time.sleep(0.5)
        screenshot(page, "01-menu")

        # 2. 按任意键开始游戏
        page.keyboard.press("Space")
        time.sleep(1.0)
        screenshot(page, "02-racing-start")

        # 3. 加速并驾驶
        page.keyboard.down("w")
        page.keyboard.down("d")
        time.sleep(2.0)
        screenshot(page, "03-driving")
        page.keyboard.up("d")
        page.keyboard.up("w")

        # 4. 暂停
        page.keyboard.press("Escape")
        time.sleep(0.5)
        screenshot(page, "04-paused")
        page.keyboard.press("Escape")
        time.sleep(0.5)
        screenshot(page, "05-resumed")

        # 5. 切回菜单（任意键暂停后，当前阶段需要按 Escape 才能暂停，再按继续）
        # 尝试长按 W 一段时间模拟跑圈
        page.keyboard.down("w")
        time.sleep(10.0)
        page.keyboard.up("w")
        screenshot(page, "06-after-long-drive")

        # 6. 分屏模式
        page2 = browser.new_page()
        page2.goto("http://localhost:5175/?split=1")
        page2.wait_for_load_state("networkidle")
        time.sleep(0.5)
        screenshot(page2, "07-split-menu")
        page2.keyboard.press("Space")
        time.sleep(1.0)
        screenshot(page2, "08-split-racing")
        page2.keyboard.down("w")
        page2.keyboard.down("ArrowUp")
        time.sleep(2.0)
        screenshot(page2, "09-split-driving")
        page2.keyboard.up("w")
        page2.keyboard.up("ArrowUp")

        # 7. 赛道切换
        page3 = browser.new_page()
        page3.goto("http://localhost:5175/")
        page3.wait_for_load_state("networkidle")
        time.sleep(0.5)
        screenshot(page3, "10-track-select-default")
        page3.keyboard.press("Digit2")
        time.sleep(0.5)
        screenshot(page3, "11-track-select-highway")
        page3.keyboard.press("Digit3")
        time.sleep(0.5)
        screenshot(page3, "12-track-select-s-curve")
        page3.keyboard.press("Digit1")
        time.sleep(0.5)
        screenshot(page3, "13-track-select-classic")

        browser.close()


if __name__ == "__main__":
    main()
