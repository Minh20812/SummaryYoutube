// Mảng lưu trữ các URL kênh
let channels = [];
let isProcessing = false;

let channelVideosCache = new Map(); // Cache để lưu trữ tất cả video của mỗi kênh
const LOAD_MORE_COUNT = 5; // Số video được thêm mỗi lần nhấn "Xem thêm"

// DOM Elements
const channelInput = document.getElementById("channelInput");
const addChannelBtn = document.getElementById("addChannelBtn");
const channelList = document.getElementById("channelList");
const fetchVideosBtn = document.getElementById("fetchVideosBtn");
const resultsDiv = document.getElementById("results");
const loadingDiv = document.getElementById("loading");
const errorDiv = document.getElementById("error");
const progressBar = document.getElementById("progress");
const progressFill = document.getElementById("progressFill");

// Lấy channels từ localStorage nếu có
function loadChannelsFromStorage() {
  const storedChannels = localStorage.getItem("youtubeChannels");
  if (storedChannels) {
    channels = JSON.parse(storedChannels);
    updateChannelList();
  }
}

// Lưu channels vào localStorage
function saveChannelsToStorage() {
  localStorage.setItem("youtubeChannels", JSON.stringify(channels));
}

// Thêm kênh vào danh sách
addChannelBtn.addEventListener("click", () => {
  const url = channelInput.value.trim();

  if (url && isValidYouTubeUrl(url)) {
    if (!channels.includes(url)) {
      channels.push(url);
      updateChannelList();
      saveChannelsToStorage();
      channelInput.value = "";
    } else {
      alert("Kênh này đã được thêm vào danh sách!");
    }
  } else {
    alert("Vui lòng nhập URL kênh YouTube hợp lệ");
  }
});

// Cập nhật giao diện danh sách kênh
function updateChannelList() {
  channelList.innerHTML = "";

  channels.forEach((channel, index) => {
    const li = document.createElement("li");

    const channelText = document.createElement("span");
    channelText.textContent = channel;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Xóa";
    removeBtn.className = "remove-btn";
    removeBtn.addEventListener("click", () => {
      channels.splice(index, 1);
      updateChannelList();
      saveChannelsToStorage();
    });

    li.appendChild(channelText);
    li.appendChild(removeBtn);
    channelList.appendChild(li);
  });

  // Cập nhật trạng thái nút Fetch
  fetchVideosBtn.disabled = channels.length === 0;
}

// Kiểm tra URL YouTube hợp lệ
function isValidYouTubeUrl(url) {
  try {
    const urlObj = new URL(url);
    return (
      (urlObj.hostname === "www.youtube.com" ||
        urlObj.hostname === "youtube.com") &&
      (urlObj.pathname.includes("/@") ||
        urlObj.pathname.includes("/user/") ||
        urlObj.pathname.includes("/channel/"))
    );
  } catch {
    return false;
  }
}

// Cập nhật thanh tiến trình
function updateProgress(current, total) {
  const percent = Math.round((current / total) * 100);
  progressFill.style.width = `${percent}%`;
  progressFill.textContent = `${percent}%`;
}

// Lấy video mới nhất từ các kênh
fetchVideosBtn.addEventListener("click", async () => {
  if (channels.length === 0) {
    alert("Vui lòng thêm ít nhất một kênh YouTube");
    return;
  }

  if (isProcessing) {
    return;
  }

  isProcessing = true;
  fetchVideosBtn.disabled = true;
  loadingDiv.style.display = "block";
  errorDiv.style.display = "none";
  resultsDiv.innerHTML = "";
  progressBar.style.display = "block";
  updateProgress(0, channels.length);

  try {
    const allChannelData = [];
    let processedCount = 0;

    for (const channelUrl of channels) {
      try {
        // API endpoint của backend
        const response = await fetch("http://localhost:5000/api/fetch-videos", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ channelUrls: [channelUrl] }),
        });

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }

        if (data.channels && data.channels.length > 0) {
          allChannelData.push(data.channels[0]);
        }
      } catch (error) {
        console.error(`Lỗi khi xử lý kênh ${channelUrl}:`, error);
        allChannelData.push({
          channelName: "Lỗi",
          channelUrl,
          videos: [],
          error: error.message,
        });
      }

      processedCount++;
      updateProgress(processedCount, channels.length);
    }

    displayResults(allChannelData);
  } catch (error) {
    errorDiv.style.display = "block";
    errorDiv.textContent = `Lỗi: ${error.message}`;
  } finally {
    loadingDiv.style.display = "none";
    isProcessing = false;
    fetchVideosBtn.disabled = false;
  }
});

// Hiển thị kết quả từ API
function displayResults(channelData) {
  if (!channelData || channelData.length === 0) {
    resultsDiv.innerHTML = "<p>Không tìm thấy kênh hoặc video nào.</p>";
    return;
  }

  const initialVideoCount =
    parseInt(document.getElementById("initialVideoCount").value) || 2;
  let resultsHTML = "<h2>Kết quả</h2>";

  channelData.forEach((channel) => {
    // Lưu videos vào cache
    channelVideosCache.set(channel.channelUrl, channel.videos || []);

    resultsHTML += `
  <div class="channel-result">
    <h3>${channel.channelName}</h3>
    <p><a href="${channel.channelUrl}" target="_blank">${channel.channelUrl}</a></p>
`;

    if (channel.error) {
      resultsHTML += `<p class="channel-error">Lỗi: ${channel.error}</p>`;
    }

    if (channel.videos && channel.videos.length > 0) {
      resultsHTML += `<div class="channel-videos-container" data-channel-url="${channel.channelUrl}">`;

      // Hiển thị số video ban đầu
      channel.videos.slice(0, initialVideoCount).forEach((video) => {
        resultsHTML += createVideoHTML(video);
      });

      // Thêm nút "Xem thêm" nếu còn video
      if (channel.videos.length > initialVideoCount) {
        resultsHTML += `
      <button 
        class="load-more-btn" 
        onclick="loadMoreVideos('${channel.channelUrl}', ${initialVideoCount})"
      >
        Xem thêm video (còn ${channel.videos.length - initialVideoCount} video)
      </button>
    `;
      }

      resultsHTML += "</div>";
    } else {
      resultsHTML += "<p>Không tìm thấy video nào.</p>";
    }

    resultsHTML += "</div>";
  });

  resultsDiv.innerHTML = resultsHTML;
}

// Function to toggle between video preview and thumbnail
function toggleVideoPreview(videoId, videoTitle) {
  const thumbnailContainer = document.getElementById(`thumbnail-${videoId}`);

  // Check if currently showing thumbnail or video
  const isShowingThumbnail = thumbnailContainer.querySelector("img") !== null;

  if (isShowingThumbnail) {
    // Switch to video embed display
    thumbnailContainer.innerHTML = `
      <div class="video-embed">
        <iframe 
          src="https://www.youtube.com/embed/${videoId}?autoplay=1" 
          title="${decodeURIComponent(videoTitle)}" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
          referrerpolicy="strict-origin-when-cross-origin" 
          allowfullscreen>
        </iframe>
      </div>
      <button class="preview-toggle" onclick="toggleVideoPreview('${videoId}', '${videoTitle}')">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    `;
  } else {
    // Switch back to thumbnail display
    const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    thumbnailContainer.innerHTML = `
      <img src="${thumbnailUrl}" alt="${decodeURIComponent(
      videoTitle
    )}" loading="lazy">
      <button class="preview-toggle" onclick="toggleVideoPreview('${videoId}', '${videoTitle}')">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path fill="currentColor" d="M8 5v14l11-7z"/>
        </svg>
      </button>
    `;
  }
}

// Function to show summary options when the summary button is clicked
function getSummary(videoId, videoTitle) {
  if (!videoId) {
    alert("Không tìm thấy ID video");
    return;
  }

  // Create a dropdown/popup for summary options
  const videoContainer = document.getElementById(`video-container-${videoId}`);
  const existingMenu = document.getElementById(`summary-menu-${videoId}`);

  // If menu already exists, remove it (toggle behavior)
  if (existingMenu) {
    existingMenu.remove();
    return;
  }

  // Create summary options menu
  const summaryMenu = document.createElement("div");
  summaryMenu.id = `summary-menu-${videoId}`;
  summaryMenu.className = "summary-options-menu";
  summaryMenu.innerHTML = `
    <div class="summary-options-header">Chọn công cụ tóm tắt:</div>
    <button onclick="openSummaryTool('summarize', '${videoId}', '${videoTitle}')">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M14 17H4v2h10v-2zm6-8H4v2h16V9zM4 15h16v-2H4v2zM4 5v2h16V5H4z"/>
      </svg>
      Summarize.tech
    </button>
    <button onclick="openSummaryTool('docsbot', '${videoId}', '${videoTitle}')">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
      </svg>
      DocsBot.ai
    </button>
  `;

  // Position the menu
  const videoActions = videoContainer.querySelector(".video-actions");
  videoActions.appendChild(summaryMenu);

  // Close menu when clicking outside
  document.addEventListener("click", function closeMenu(e) {
    if (
      !summaryMenu.contains(e.target) &&
      e.target.className !== "summary-btn" &&
      !e.target.closest(".summary-btn")
    ) {
      summaryMenu.remove();
      document.removeEventListener("click", closeMenu);
    }
  });
}

// Function to open the selected summary tool
function openSummaryTool(tool, videoId, videoTitle) {
  let summaryUrl;

  if (tool === "summarize") {
    summaryUrl = `https://summarize.tech/https://www.youtube.com/watch?v=${videoId}`;
  } else if (tool === "docsbot") {
    summaryUrl = `https://docsbot.ai/tools/ai-youtube-summarizer/${videoId}`;
  }

  window.open(summaryUrl, "_blank");

  // Close the menu
  const summaryMenu = document.getElementById(`summary-menu-${videoId}`);
  if (summaryMenu) {
    summaryMenu.remove();
  }
}

// Update createVideoHTML function to use the new summary button
function createVideoHTML(video) {
  const videoId = video.id || getVideoIdFromUrl(video.url);
  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  return `
    <div class="video-item" id="video-container-${videoId}" data-video-id="${videoId}">
      <div class="video-thumbnail" id="thumbnail-${videoId}">
        <img src="${thumbnailUrl}" alt="${video.title}" loading="lazy">
        <button class="preview-toggle" onclick="toggleVideoPreview('${videoId}', '${encodeURIComponent(
    video.title
  )}')">
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path fill="currentColor" d="M8 5v14l11-7z"/>
          </svg>
        </button>
      </div>
      <div class="video-info">
        <div class="video-title">${video.title}</div>
        <div class="video-metadata">
          <span class="video-views">${video.viewCount}</span>
          <span class="video-time">${video.publishedTime}</span>
        </div>
      </div>
      <div class="video-actions">
        ${
          videoId
            ? `
          <button class="copy-btn" onclick="copySummaryLink('${videoId}', this)">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
            Copy Link
          </button>
          <button class="download-btn" onclick="downloadSubtitle('${
            video.url
          }', '${encodeURIComponent(video.title)}', this)">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            Download SRT
          </button>
          <button class="summary-btn" onclick="getSummary('${videoId}', '${encodeURIComponent(
                video.title
              )}')">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-7-2h2v-3h3v-2h-3V9h-2v3H9v2h3z"/>
            </svg>
            Tóm tắt
          </button>
        `
            : ""
        }
      </div>
    </div>
  `;
}

// Thêm tính năng mở tất cả video dưới dạng embed trong một kênh
function showAllEmbeds(channelUrl) {
  const videos = channelVideosCache.get(channelUrl) || [];

  videos.forEach((video) => {
    const videoId = video.id || getVideoIdFromUrl(video.url);
    if (videoId) {
      const thumbnailContainer = document.getElementById(
        `thumbnail-${videoId}`
      );
      if (thumbnailContainer) {
        toggleVideoPreview(videoId, encodeURIComponent(video.title));
      }
    }
  });
}

// Add download subtitle function
async function downloadSubtitle(videoUrl, videoTitle, button) {
  try {
    button.disabled = true;
    button.innerHTML = `
      <svg class="spinner" viewBox="0 0 50 50">
        <circle cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
      </svg>
      Downloading...
    `;

    const response = await fetch(
      "http://localhost:5000/api/download-subtitle",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ videoUrl }),
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    // Create temporary link and click it to download
    const link = document.createElement("a");
    link.href = data.downloadUrl;
    link.download = `${videoTitle}.srt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    button.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
      Download SRT
    `;
  } catch (error) {
    alert(`Error downloading subtitle: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

// Thêm hàm xử lý copy link
async function copySummaryLink(videoId, button) {
  const summaryUrl = `https://summarize.tech/https://www.youtube.com/watch?v=${videoId}`;

  try {
    await navigator.clipboard.writeText(summaryUrl);

    // Hiệu ứng phản hồi khi copy thành công
    button.textContent = "Đã Copy!";
    button.classList.add("copy-success");

    // Trở lại trạng thái ban đầu sau 2 giây
    setTimeout(() => {
      button.textContent = "Copy Link Tóm Tắt";
      button.classList.remove("copy-success");
    }, 2000);
  } catch (err) {
    alert("Không thể copy link. Vui lòng thử lại.");
  }
}

// Hàm xử lý nút "Xem thêm"
async function loadMoreVideos(channelUrl, currentCount) {
  const container = document.querySelector(
    `.channel-videos-container[data-channel-url="${channelUrl}"]`
  );
  const videos = channelVideosCache.get(channelUrl) || [];

  // Lấy thêm video từ cache
  const nextVideos = videos.slice(currentCount, currentCount + LOAD_MORE_COUNT);
  let newHTML = "";

  nextVideos.forEach((video) => {
    newHTML += createVideoHTML(video);
  });

  // Cập nhật nút "Xem thêm"
  const remainingVideos = videos.length - (currentCount + LOAD_MORE_COUNT);
  if (remainingVideos > 0) {
    newHTML += `
  <button 
    class="load-more-btn" 
    onclick="loadMoreVideos('${channelUrl}', ${currentCount + LOAD_MORE_COUNT})"
  >
    Xem thêm video (còn ${remainingVideos} video)
  </button>
`;
  }

  // Thay thế nút "Xem thêm" cũ bằng nội dung mới
  container.innerHTML =
    container.innerHTML.replace(/<button.*?button>/, "") + newHTML;
}

// Hàm lấy ID video từ URL (trong trường hợp video.id không tồn tại)
function getVideoIdFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    return params.get("v");
  } catch {
    // Trường hợp URL không hợp lệ hoặc không có tham số v
    return null;
  }
}

// Khởi tạo khi trang tải xong
document.addEventListener("DOMContentLoaded", function () {
  loadChannelsFromStorage();
});
