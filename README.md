# Get Transcript Youtube

Tool tự động tải transcript (phụ đề) từ danh sách video YouTube thông qua trang downsub.com.

## Tính năng

- Tự động lấy toàn bộ URL video từ playlist YouTube
- Tự động truy cập downsub.com và lấy transcript
- Lưu transcript vào file text với tên là tiêu đề video
- Ghi nhận lỗi nếu không lấy được transcript
- Tổng kết số lượng video thành công/thất bại

## Yêu cầu

- Node.js
- pnpm (hoặc npm/yarn)

## Cài đặt

```bash
# Clone repository
git clone <repository-url>
cd GetTranscriptYoutube

# Cài đặt dependencies
pnpm install

# Cài đặt Chrome cho Puppeteer
npx puppeteer browsers install chrome
```

## Sử dụng

```bash
node src/index.js "URL_PLAYLIST_YOUTUBE"
```

Ví dụ:
```bash
node src/index.js "https://www.youtube.com/playlist?list=PLFLh04JZg3rOj5rn7dxqw3sGV7sheSkSG"
```

## Kết quả

- Các file transcript sẽ được lưu trong thư mục `downloads/`
- File transcript thành công: `[tiêu_đề_video].txt`
- File lỗi: `error_[tiêu_đề_video]_[url_video].txt`

## Xử lý lỗi

- Nếu video không có transcript tiếng Việt: Ghi nhận vào file error
- Nếu có lỗi khi xử lý video: Ghi nhận lỗi và tiếp tục xử lý video tiếp theo
- Cuối cùng hiển thị tổng kết số lượng video thành công/thất bại

## Lưu ý

- Đảm bảo có kết nối internet ổn định
- Có thể mất vài giây để xử lý mỗi video
- Không đóng trình duyệt trong quá trình chạy
