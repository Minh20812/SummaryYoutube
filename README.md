# Get YouTube Transcript  

A tool that automatically downloads transcripts (subtitles) from a list of YouTube videos via downsub.com.  

## Features  

- Automatically fetch all video URLs from a YouTube playlist  
- Automatically access downsub.com and retrieve transcripts  
- Save transcripts as text files named after the video title  
- Log errors if transcripts cannot be retrieved  
- Summarize the number of successful/failed videos  

## Requirements  

- Node.js  
- pnpm (or npm/yarn)  

## Installation  

```bash
# Clone repository
git clone <repository-url>
cd GetTranscriptYoutube

# Install dependencies
pnpm install

# Install Chrome for Puppeteer
npx puppeteer browsers install chrome
```

## Usage  

```bash
node src/index.js "YOUTUBE_PLAYLIST_URL"
```

Example:  
```bash
node src/index.js "https://www.youtube.com/playlist?list=PLFLh04JZg3rOj5rn7dxqw3sGV7sheSkSG"
```

## Results  

- Transcripts will be saved in the `downloads/` folder  
- Successful transcript files: `[video_title].txt`  
- Error files: `error_[video_title]_[video_url].txt`  

## Error Handling  

- If a video does not have a Vietnamese transcript: Log it in an error file  
- If an error occurs while processing a video: Log the error and continue with the next video  
- Finally, display a summary of the number of successful/failed videos  

## Notes  

- Ensure a stable internet connection  
- Processing each video may take a few seconds  
- Do not close the browser while running the script  
