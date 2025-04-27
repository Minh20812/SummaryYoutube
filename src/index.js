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
    args: ["--start-maximized"], // Open window in full size
  });
  const page = await browser.newPage();
  // Set viewport to maximum size
  await page.setViewport({
    width: 1920,
    height: 1080,
  });

  // Ensure download directory exists
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

    // Wait for video list to load
    await page.waitForSelector('a[href*="watch?v="]');

    // Scroll to load all videos in the playlist
    let previousHeight = 0;
    let currentHeight = 0;
    let scrollTries = 0;
    do {
      previousHeight = await page.evaluate(
        "document.documentElement.scrollHeight"
      );
      await page.evaluate(
        "window.scrollTo(0, document.documentElement.scrollHeight)"
      );
      await setTimeout(1500);
      currentHeight = await page.evaluate(
        "document.documentElement.scrollHeight"
      );
      scrollTries++;
    } while (currentHeight > previousHeight && scrollTries < 50);

    // Lấy tất cả URL video trong playlist
    const videoUrls = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="watch?v="]');
      const urls = new Set(); // Use Set to remove duplicates
      links.forEach((link) => {
        const url = new URL(link.href);
        // Only get URLs with format watch?v=
        if (url.searchParams.has("v")) {
          urls.add(url.href);
        }
      });
      return Array.from(urls);
    });

    await browser.close();
    return videoUrls;
  } catch (error) {
    console.error("Error while fetching video list from playlist:", error);
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
    // Remove invalid characters from file name
    return data.title.replace(/[<>:"/\\|?*-]/g, "_");
  } catch (error) {
    console.error("Error while fetching video title:", error);
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
    console.log(`Processing video: ${videoTitle}`);

    // Go to downsub.com
    await page.goto("https://downsub.com/");
    await page.waitForSelector('input[name="url"]');

    // Enter video URL
    await page.type('input[name="url"]', videoUrl);

    // Click search button
    await page.click('button[type="submit"]');

    // Wait for subtitles to be loaded (longer timeout since it might take time)
    try {
      // Đợi cho các nút tải xuống xuất hiện
      await page.waitForSelector('button[data-title*="Vietnamese"]', {
        timeout: 30000,
      });

      // Tìm nút tải xuống định dạng SRT tiếng Việt
      const srtButtons = await page.$$('button[data-title*="Vietnamese"]');
      let srtButton = null;

      // Tìm nút SRT (không phải RAW)
      for (const button of srtButtons) {
        const buttonTitle = await page.evaluate(
          (el) => el.getAttribute("data-title"),
          button
        );
        if (
          buttonTitle.includes("Vietnamese") &&
          !buttonTitle.includes("[RAW]")
        ) {
          srtButton = button;
          break;
        }
      }

      // Nếu không tìm thấy nút SRT tiếng Việt, tìm nút SRT tiếng Anh
      if (!srtButton) {
        console.log(
          `Vietnamese SRT not found for ${videoTitle}, trying English...`
        );
        const engButtons = await page.$$('button[data-title*="English"]');
        for (const button of engButtons) {
          const buttonTitle = await page.evaluate(
            (el) => el.getAttribute("data-title"),
            button
          );
          if (
            buttonTitle.includes("English") &&
            !buttonTitle.includes("[RAW]")
          ) {
            srtButton = button;
            break;
          }
        }
      }

      if (srtButton) {
        // Click nút SRT để tải xuống
        await srtButton.click();
        console.log(`Downloading SRT for video: ${videoTitle}`);

        // Đợi một khoảng thời gian để file được tải xuống
        await setTimeout(3000);

        // Kiểm tra xem file đã được tải xuống chưa
        const files = await fs.readdir(DOWNLOAD_DIR);
        const downloadedFile = files.find(
          (file) =>
            file.endsWith(".srt") &&
            new Date(
              fs.statSync(path.join(DOWNLOAD_DIR, file)).mtime
            ).getTime() >
              new Date().getTime() - 10000
        );

        if (downloadedFile) {
          // Đổi tên file nếu cần
          const newFileName = `${videoTitle}.srt`;
          const oldPath = path.join(DOWNLOAD_DIR, downloadedFile);
          const newPath = path.join(DOWNLOAD_DIR, newFileName);

          if (downloadedFile !== newFileName) {
            await fs.rename(oldPath, newPath);
            console.log(`Renamed downloaded file to: ${newFileName}`);
          }

          console.log(`SRT saved for video: ${videoTitle}`);
        } else {
          console.log(
            `Failed to detect downloaded SRT file for: ${videoTitle}`
          );
          const errorPath = path.join(
            DOWNLOAD_DIR,
            `error_${videoTitle}_${videoId}.txt`
          );
          await fs.writeFile(
            errorPath,
            "SRT download failed - file not detected"
          );
        }
      } else {
        console.log(`No suitable subtitle button found for: ${videoTitle}`);
        const errorPath = path.join(
          DOWNLOAD_DIR,
          `error_${videoTitle}_${videoId}.txt`
        );
        await fs.writeFile(errorPath, "No SRT subtitle option found");
      }
    } catch (error) {
      // Save error info to file
      const errorPath = path.join(
        DOWNLOAD_DIR,
        `error_${videoTitle}_${videoId}.txt`
      );
      await fs.writeFile(errorPath, `Error: ${error.message}`);
      console.log(
        `Failed to download SRT for video: ${videoTitle} - ${error.message}`
      );
    }
  } catch (error) {
    const videoId = await getVideoId(videoUrl);
    const errorPath = path.join(DOWNLOAD_DIR, `error_unknown_${videoId}.txt`);
    await fs.writeFile(errorPath, `Unknown error: ${error.message}`);
    console.error(`Error processing video ${videoUrl}:`, error.message);
  }
}

async function main() {
  // Require user to input playlist URL
  if (process.argv.length < 3) {
    console.log("Please provide a YouTube playlist URL. Example:");
    console.log("node src/index.js https://www.youtube.com/playlist?list=xxx");
    process.exit(1);
  }

  const playlistUrl = process.argv[2];
  console.log("Fetching video list from playlist...");
  const videoUrls = await getPlaylistVideos(playlistUrl);

  if (videoUrls.length === 0) {
    console.log("No videos found in the playlist.");
    process.exit(1);
  }

  // Highlight total video count
  console.log(
    `[1m[36m==============================\nFound ${videoUrls.length} videos in the playlist.\n==============================[0m`
  );

  const { browser, page } = await setupBrowser();

  try {
    for (const videoUrl of videoUrls) {
      await getTranscript(page, videoUrl);
      await setTimeout(2000); // Wait between videos to avoid overload
    }
  } finally {
    await browser.close();
  }

  // Show summary
  const files = await fs.readdir(DOWNLOAD_DIR);
  const successFiles = files.filter((file) => file.endsWith(".srt"));
  const errorFiles = files.filter((file) => file.startsWith("error_"));

  console.log("\n=== Summary ===");
  console.log(`Total videos: ${videoUrls.length}`);
  console.log(`Successfully downloaded: ${successFiles.length}`);
  console.log(`Failed: ${errorFiles.length}`);
}

main().catch(console.error);
