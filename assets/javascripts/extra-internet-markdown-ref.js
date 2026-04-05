document.addEventListener('DOMContentLoaded', function () {
  fetch('https://raw.githubusercontent.com/QianMo/Game-Programmer-Study-Notes/master/Content/%E9%AB%98%E5%93%81%E8%B4%A8%E5%90%8E%E5%A4%84%E7%90%86%EF%BC%9A%E5%8D%81%E7%A7%8D%E5%9B%BE%E5%83%8F%E6%A8%A1%E7%B3%8A%E7%AE%97%E6%B3%95%E7%9A%84%E6%80%BB%E7%BB%93%E4%B8%8E%E5%AE%9E%E7%8E%B0/README.md')
    .then(response => response.text())
    .then(text => {
      // 替换相对路径为 GitHub 上的绝对路径
      const updatedText = text.replace(/\!\[([^\]]*)\]\(([^)]+)\)/g, function(match, alt, path) {
        // 判断是否为相对路径，并转换为 GitHub 的绝对路径
        if (path.startsWith('media/')) {
          const absolutePath = 'https://raw.githubusercontent.com/QianMo/Game-Programmer-Study-Notes/master/Content/%E9%AB%98%E5%93%81%E8%B4%A8%E5%90%8E%E5%A4%84%E7%90%86%EF%BC%9A%E5%8D%81%E7%A7%8D%E5%9B%BE%E5%83%8F%E6%A8%A1%E7%B3%8A%E7%AE%97%E6%B3%95%E7%9A%84%E6%80%BB%E7%BB%93%E4%B8%8E%E5%AE%9E%E7%8E%B0/' + path.replace('./', '');
          return `![${alt}](${absolutePath})`;
        }
        return match;
      });

      // 使用 marked.js 渲染处理过的文本
      document.getElementById('bluring').innerHTML = marked.parse(updatedText);
    })
    .catch(error => console.error('Error fetching markdown:', error));
});

document.addEventListener('DOMContentLoaded', function () {
  fetch('https://raw.githubusercontent.com/QianMo/Game-Programmer-Study-Notes/master/Content/%E5%AE%9E%E6%97%B6%E5%85%89%E7%BA%BF%E8%BF%BD%E8%B8%AA%E6%8A%80%E6%9C%AF%EF%BC%9A%E4%B8%9A%E7%95%8C%E5%8F%91%E5%B1%95%E8%BF%91%E5%86%B5%E4%B8%8E%E6%9C%AA%E6%9D%A5%E6%8C%91%E6%88%98/README.md')
    .then(response => response.text())
    .then(text => {
      // 替换相对路径为 GitHub 上的绝对路径
      const updatedText = text.replace(/\!\[([^\]]*)\]\(([^)]+)\)/g, function(match, alt, path) {
        // 判断是否为相对路径，并转换为 GitHub 的绝对路径
        if (path.startsWith('media/')) {
          const absolutePath = 'https://raw.githubusercontent.com/QianMo/Game-Programmer-Study-Notes/master/Content/%E5%AE%9E%E6%97%B6%E5%85%89%E7%BA%BF%E8%BF%BD%E8%B8%AA%E6%8A%80%E6%9C%AF%EF%BC%9A%E4%B8%9A%E7%95%8C%E5%8F%91%E5%B1%95%E8%BF%91%E5%86%B5%E4%B8%8E%E6%9C%AA%E6%9D%A5%E6%8C%91%E6%88%98/' + path.replace('./', '');
          return `![${alt}](${absolutePath})`;
        }
        return match;
      });

      // 使用 marked.js 渲染处理过的文本
      document.getElementById('rayTracing').innerHTML = marked.parse(updatedText);
    })
    .catch(error => console.error('Error fetching markdown:', error));
});
