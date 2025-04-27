import express from "express";
import puppeteer from "puppeteer";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// Hàm an toàn để trích xuất ID video từ URL
function extractVideoId(url) {
  if (!url) return "";

  try {
    // Kiểm tra xem có phải URL YouTube không
    if (url.includes("youtube.com/watch") || url.includes("youtu.be/")) {
      // Trường hợp youtube.com/watch?v=ID
      if (url.includes("v=")) {
        const idParam = url.split("v=")[1];
        if (idParam) {
          return idParam.split("&")[0] || "";
        }
      }
      // Trường hợp youtu.be/ID
      else if (url.includes("youtu.be/")) {
        return url.split("youtu.be/")[1]?.split("?")[0] || "";
      }
    }
    return "";
  } catch (error) {
    console.error("Lỗi khi trích xuất ID video:", error);
    return "";
  }
}

// Hàm trích xuất video từ kênh YouTube (phiên bản tối ưu để lấy 3 video mới nhất)
async function getChannelVideos(channelUrl) {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Thiết lập user agent để giống trình duyệt thông thường
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36"
    );

    // Chuyển đến trang videos của kênh
    const videosUrl = channelUrl.endsWith("/videos")
      ? channelUrl
      : `${channelUrl}/videos`;
    console.log(`Truy cập trang videos của kênh: ${videosUrl}`);

    await page.goto(videosUrl, {
      waitUntil: "networkidle2",
      timeout: 60000, // 60 giây timeout
    });

    // Đợi một chút để đảm bảo trang đã tải đầy đủ
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Chọn nhiều selector khác nhau để tăng khả năng tìm thấy video
    const containerSelector =
      "#contents ytd-rich-grid-row, ytd-grid-renderer, ytd-rich-grid-renderer, ytd-two-column-browse-results-renderer";
    await page
      .waitForSelector(containerSelector, {
        timeout: 30000,
      })
      .catch(() =>
        console.log(`Không tìm thấy container video trên kênh ${channelUrl}`)
      );

    // Cuộn trang nhẹ để đảm bảo các video đã được tải
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Sử dụng nhiều selector khác nhau để tìm video
    const videos = await page.evaluate(() => {
      // Các selector khác nhau cho các phiên bản khác nhau của YouTube
      const selectors = [
        // Phiên bản mới của YouTube
        "ytd-rich-grid-media a#video-title-link",
        "ytd-rich-item-renderer a#video-title-link",
        // Phiên bản cũ hơn
        "ytd-grid-video-renderer a#video-title",
        // Selector chung
        "a#video-title",
        // Selector bổ sung
        "a.yt-simple-endpoint.style-scope.ytd-video-renderer",
        // Selector cho phiên bản mobile
        "h3 a.yt-simple-endpoint",
        // Selector cho kênh có sắp xếp khác
        "#dismissible a#video-title",
        "#dismissible a.yt-simple-endpoint",
      ];

      // Tìm kiếm videos với tất cả các selector
      let allVideoElements = [];
      selectors.forEach((selector) => {
        const elements = Array.from(document.querySelectorAll(selector));
        if (elements.length > 0) {
          allVideoElements = [...allVideoElements, ...elements];
        }
      });

      // Lọc các phần tử trùng lặp bằng URL
      const uniqueVideos = [];
      const urlSet = new Set();

      for (const element of allVideoElements) {
        const url = element.href;
        if (url && !urlSet.has(url) && url.includes("/watch?v=")) {
          urlSet.add(url);

          // Tìm container chứa metadata của video
          const container = element.closest(
            "ytd-rich-item-renderer, ytd-video-renderer"
          );
          if (!container) continue;

          // Tìm thời gian đăng video
          const metadataLine = container.querySelector("#metadata-line");
          const timeText = Array.from(
            metadataLine?.querySelectorAll("span") || []
          )
            .map((span) => span.textContent.trim())
            .find(
              (text) =>
                text.includes("giờ trước") ||
                text.includes("phút trước") ||
                text.includes("ngày trước") ||
                text.includes("tuần trước") ||
                text.includes("tháng trước") ||
                text.includes("năm trước") ||
                // English variants
                text.includes("hours ago") ||
                text.includes("minutes ago") ||
                text.includes("days ago") ||
                text.includes("weeks ago") ||
                text.includes("months ago") ||
                text.includes("years ago")
            );

          // Tìm view count
          const viewCount = Array.from(
            metadataLine?.querySelectorAll("span") || []
          )
            .map((span) => span.textContent.trim())
            .find(
              (text) => text.includes("lượt xem") || text.includes("views")
            );

          uniqueVideos.push({
            title: element.textContent?.trim() || "Untitled Video",
            url: url,
            publishedTime: timeText || "Unknown time",
            viewCount: viewCount || "0 views",
          });
        }
      }

      // Lấy 5 video mới nhất
      return uniqueVideos.slice(0, 5);
    });

    console.log(`Tìm thấy ${videos.length} video từ kênh`);

    // Lấy tên kênh
    const channelName = await page.evaluate(() => {
      const selectors = [
        "#channel-name",
        "#channel-header yt-formatted-string",
        "ytd-channel-name yt-formatted-string",
        "#inner-header-container ytd-channel-name",
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element.textContent.trim();
        }
      }

      return "Unknown Channel";
    });

    // Chụp ảnh màn hình để debug nếu không tìm thấy video
    if (videos.length === 0) {
      await page.screenshot({
        path: `debug-${new URL(channelUrl).hostname}.png`,
      });
      console.log(
        `Đã chụp ảnh màn hình để debug: debug-${
          new URL(channelUrl).hostname
        }.png`
      );
    }

    await browser.close();

    // Thêm ID video bằng hàm an toàn
    const processedVideos = videos.map((video) => {
      const id = extractVideoId(video.url);
      return {
        ...video,
        id,
        // Thêm URL embed để dễ dàng nhúng video
        embedUrl: id ? `https://www.youtube.com/embed/${id}` : "",
      };
    });

    return {
      channelName,
      channelUrl,
      videos: processedVideos,
    };
  } catch (error) {
    console.error(`Lỗi khi truy cập kênh ${channelUrl}:`, error);
    return {
      channelName: "Error",
      channelUrl,
      videos: [],
      error: error.message,
    };
  }
}

// API endpoint để lấy thông tin video mới từ kênh YouTube
app.post("/api/fetch-videos", async (req, res) => {
  try {
    const { channelUrls } = req.body;

    if (
      !channelUrls ||
      !Array.isArray(channelUrls) ||
      channelUrls.length === 0
    ) {
      return res
        .status(400)
        .json({ error: "Vui lòng cung cấp danh sách URL kênh hợp lệ" });
    }

    const allVideos = [];

    // Xử lý từng kênh một cách tuần tự
    for (const channelUrl of channelUrls) {
      try {
        console.log(`Đang xử lý kênh: ${channelUrl}`);
        const channelData = await getChannelVideos(channelUrl);
        allVideos.push(channelData);
      } catch (error) {
        console.error(`Lỗi khi xử lý kênh ${channelUrl}:`, error);
        allVideos.push({
          channelName: "Error",
          channelUrl,
          videos: [],
          error: error.message,
        });
      }
    }

    res.json({ channels: allVideos });
  } catch (error) {
    console.error("Lỗi server:", error);
    res.status(500).json({ error: "Đã xảy ra lỗi khi xử lý yêu cầu" });
  }
});

// Helper function to auto-scroll the page
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.documentElement.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight || totalHeight > 6000) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
