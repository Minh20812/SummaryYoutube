import puppeteer from "puppeteer";
import fs from "fs-extra";
import { setTimeout } from "timers/promises";
import path from "path";
import fetch from "node-fetch";

const DOWNLOAD_DIR = "./downloads";

async function setupBrowser() {
   const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ["--start-maximized"], // Mở cửa sổ full size
   });
   const page = await browser.newPage();
   // Set viewport to maximum size
   await page.setViewport({
      width: 1920,
      height: 1080,
   });

   // Thiết lập thư mục tải xuống
   await fs.ensureDir(DOWNLOAD_DIR);
   const client = await page.target().createCDPSession();
   await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: path.resolve(DOWNLOAD_DIR),
   });

   return { browser, page };
}

async function getPlaylistVideos(playlistUrl) {
   try {
      const browser = await puppeteer.launch({
         headless: true,
         defaultViewport: {
            width: 1920,
            height: 1080,
         },
      });
      const page = await browser.newPage();
      await page.setViewport({
         width: 1920,
         height: 1080,
      });
      await page.goto(playlistUrl);

      // Chờ danh sách video tải
      await page.waitForSelector('a[href*="watch?v="]');

      // Lấy tất cả URL video trong playlist
      const videoUrls = await page.evaluate(() => {
         const links = document.querySelectorAll('a[href*="watch?v="]');
         const urls = new Set(); // Sử dụng Set để loại bỏ trùng lặp
         links.forEach((link) => {
            const url = new URL(link.href);
            // Chỉ lấy các URL có định dạng watch?v=
            if (url.searchParams.has("v")) {
               urls.add(url.href);
            }
         });
         return Array.from(urls);
      });

      await browser.close();
      return videoUrls;
   } catch (error) {
      console.error("Lỗi khi lấy danh sách video từ playlist:", error);
      return [];
   }
}

async function getYouTubeTitle(url) {
   try {
      const videoId = url.split("v=")[1].split("&")[0];
      const response = await fetch(
         `https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`
      );
      const data = await response.json();
      // Loại bỏ các ký tự không hợp lệ trong tên file
      return data.title.replace(/[<>:"/\\|?*-]/g, "_");
   } catch (error) {
      console.error("Lỗi khi lấy tiêu đề video:", error);
      return "unknown_title";
   }
}

async function getVideoId(url) {
   try {
      return url.split("v=")[1].split("&")[0];
   } catch (error) {
      return "unknown";
   }
}

async function getTranscript(page, videoUrl) {
   try {
      const videoTitle = await getYouTubeTitle(videoUrl);
      const videoId = await getVideoId(videoUrl);
      console.log(`Đang xử lý video: ${videoTitle}`);

      // Truy cập trang downsub.com
      await page.goto("https://downsub.com/");
      await page.waitForSelector('input[name="url"]');

      // Nhập URL video
      await page.type('input[name="url"]', videoUrl);

      // Click nút tìm kiếm
      await page.click('button[type="submit"]');

      // Đợi tối đa 30 giây để tìm nút Raw
      try {
         await page.waitForSelector('button[data-title*="[RAW] Vietnamese"]', {
            timeout: 30000,
         });
         // Click vào nút Raw để hiển thị nội dung
         const rawButton = await page.$(
            'button[data-title*="[RAW] Vietnamese"]'
         );
         await rawButton.click();

         // Đợi và lấy nội dung text
         await setTimeout(1000); // Đợi 1 giây để nội dung hiển thị
         const textContent = await page.$eval("pre", (el) => el.textContent);

         if (textContent) {
            // Lưu nội dung vào file
            const filePath = path.join(DOWNLOAD_DIR, `${videoTitle}.txt`);
            await fs.writeFile(filePath, textContent);
            console.log(`Đã lưu transcript cho video: ${videoTitle}`);
         } else {
            // Lưu thông tin lỗi vào file
            const errorPath = path.join(
               DOWNLOAD_DIR,
               `error_${videoTitle}_${videoId}.txt`
            );
            await fs.writeFile(errorPath, "Không tìm thấy nội dung transcript");
            console.log(
               `Không tìm thấy nội dung transcript cho video: ${videoTitle}`
            );
         }
      } catch (error) {
         // Lưu thông tin lỗi vào file
         const errorPath = path.join(
            DOWNLOAD_DIR,
            `error_${videoTitle}_${videoId}.txt`
         );
         await fs.writeFile(errorPath, `Lỗi: ${error.message}`);
         console.log(
            `Không tìm thấy transcript tiếng Việt cho video: ${videoTitle}`
         );
      }
   } catch (error) {
      const videoId = await getVideoId(videoUrl);
      const errorPath = path.join(DOWNLOAD_DIR, `error_unknown_${videoId}.txt`);
      await fs.writeFile(errorPath, `Lỗi không xác định: ${error.message}`);
      console.error(`Lỗi khi xử lý video ${videoUrl}:`, error.message);
   }
}

async function main() {
   // Yêu cầu người dùng nhập URL playlist
   if (process.argv.length < 3) {
      console.log("Vui lòng cung cấp URL playlist YouTube. Ví dụ:");
      console.log(
         "node src/index.js https://www.youtube.com/playlist?list=xxx"
      );
      process.exit(1);
   }

   const playlistUrl = process.argv[2];
   console.log("Đang lấy danh sách video từ playlist...");
   const videoUrls = await getPlaylistVideos(playlistUrl);

   if (videoUrls.length === 0) {
      console.log("Không tìm thấy video nào trong playlist.");
      process.exit(1);
   }

   console.log(`Tìm thấy ${videoUrls.length} video trong playlist.`);

   const { browser, page } = await setupBrowser();

   try {
      for (const videoUrl of videoUrls) {
         await getTranscript(page, videoUrl);
         await setTimeout(2000); // Đợi giữa các video để tránh quá tải
      }
   } finally {
      await browser.close();
   }

   // Hiển thị tổng kết
   const files = await fs.readdir(DOWNLOAD_DIR);
   const successFiles = files.filter((file) => !file.startsWith("error_"));
   const errorFiles = files.filter((file) => file.startsWith("error_"));

   console.log("\n=== Tổng kết ===");
   console.log(`Tổng số video: ${videoUrls.length}`);
   console.log(`Số video tải thành công: ${successFiles.length}`);
   console.log(`Số video lỗi: ${errorFiles.length}`);
}

main().catch(console.error);
