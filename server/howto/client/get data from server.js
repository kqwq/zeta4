addEventListener("message", ({ source, data }) => {
    if (!source.uid) return;
    doStuff(JSON.parse(data));
});

function doStuff(data) {
    // Handle data from server
}