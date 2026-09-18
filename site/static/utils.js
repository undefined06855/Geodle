/**
 * @param {string | number | Date} dateString
 */
function calculateRelativeDate(dateString) {
    if (dateString == "????") {
        return document.createTextNode(dateString);
    }

    let diff = ~~((Date.now() - new Date(dateString).getTime()) / 1000);

    let relative;
    if (diff < 60) {
        relative = `${diff} seconds ago`;
    } else if (diff < 3600) {
        relative = `${~~(diff / 60)} minutes ago`;
    } else if (diff < 86400) {
        relative = `${~~(diff / 3600)} hours ago`;
    } else if (diff < 2592000) {
        relative = `${~~(diff / 86400)} days ago`;
    } else if (diff < 31536000) {
        relative = `${~~(diff / 2592000)} months ago`;
    } else {
        relative = `${~~(diff / 31536000)} years ago`;
    }

    // lol
    if (parseInt(relative) == 1) relative = relative.replace("s", "");

    return document.createTextNode(relative);
}

/**
 * @param {number} count
 */
function abbreviateDownloadCount(count) {
    if (count >= 1000000) {
        let fixed = (count / 1000000).toFixed(1);
        if (fixed.endsWith(".0")) fixed = fixed.slice(0, -2);
        return document.createTextNode(`${fixed}M`);
    }

    if (count >= 1000) {
        let fixed = (count / 1000).toFixed(1);
        if (fixed.endsWith(".0")) fixed = fixed.slice(0, -2);
        return document.createTextNode(`${fixed}K`);
    }

    return document.createTextNode(`${count}`);
}
