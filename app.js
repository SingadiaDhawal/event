let selectedBlob = null;

let currentJobId = null;

let cameraStream = null;

const API_BASE =
    String(
        CONFIG.BACKEND_URL
    ).replace(
        /\/+$/,
        ""
    );


document
    .getElementById(
        "file-input"
    )
    .addEventListener(
        "change",
        handleFile
    );


function switchTab(
    tab
) {

    document
        .getElementById(
            "upload-tab"
        )
        .classList
        .toggle(
            "active",
            tab === "upload"
        );


    document
        .getElementById(
            "camera-tab"
        )
        .classList
        .toggle(
            "active",
            tab === "camera"
        );


    document
        .getElementById(
            "upload-content"
        )
        .classList
        .toggle(
            "active",
            tab === "upload"
        );


    document
        .getElementById(
            "camera-content"
        )
        .classList
        .toggle(
            "active",
            tab === "camera"
        );


    if (tab === "camera") {

        document
            .querySelector(
                ".camera"
            )
            .style.display =
                "block";

    }

}


function handleFile(
    event
) {

    const file =
        event.target.files[0];


    if (!file) {

        return;

    }


    selectedBlob =
        file;


    const url =
        URL.createObjectURL(
            file
        );


    document
        .getElementById(
            "preview-image"
        )
        .src =
            url;


    document
        .getElementById(
            "upload-preview"
        )
        .style.display =
            "block";


    document
        .getElementById(
            "find-button"
        )
        .disabled =
            false;


    hideError();

}


async function startCamera() {

    hideError();


    try {

        if (cameraStream) {

            cameraStream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );

        }


        cameraStream =
            await navigator.mediaDevices
                .getUserMedia(
                    {
                        video:
                            {
                                facingMode:
                                    "user"
                            },

                        audio:
                            false
                    }
                );


        document
            .getElementById(
                "video"
            )
            .srcObject =
                cameraStream;

    }
    catch (
        error
    ) {

        showError(
            "Unable to access the camera. Please allow camera permission or upload a photo instead."
        );

    }

}


function capturePhoto() {

    const video =
        document.getElementById(
            "video"
        );


    const canvas =
        document.getElementById(
            "canvas"
        );


    if (
        !video.videoWidth
        ||
        !video.videoHeight
    ) {

        showError(
            "Please start the camera first."
        );

        return;

    }


    canvas.width =
        video.videoWidth;


    canvas.height =
        video.videoHeight;


    const context =
        canvas.getContext(
            "2d"
        );


    context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
    );


    canvas.toBlob(
        function(blob) {

            selectedBlob =
                blob;


            document
                .getElementById(
                    "find-button"
                )
                .disabled =
                    false;


            document
                .getElementById(
                    "preview-image"
                )
                .src =
                    URL.createObjectURL(
                        blob
                    );


            document
                .getElementById(
                    "upload-preview"
                )
                .style.display =
                    "block";

        },

        "image/jpeg",

        0.92
    );

}


async function startSearch() {

    hideError();


    if (!selectedBlob) {

        showError(
            "Please upload or capture a photo first."
        );

        return;

    }


    document
        .getElementById(
            "find-button"
        )
        .disabled =
            true;


    document
        .getElementById(
            "input-card"
        )
        .style.display =
            "none";


    document
        .getElementById(
            "status"
        )
        .style.display =
            "block";


    document
        .getElementById(
            "status-text"
        )
        .innerText =
            "Connecting to photo finder...";


    document
        .getElementById(
            "progress-bar"
        )
        .style.width =
            "5%";


    try {

        const formData =
            new FormData();


        formData.append(
            "selfie",
            selectedBlob,
            "selfie.jpg"
        );


        const response =
            await fetch(
                API_BASE +
                "/api/start-scan",
                {
                    method:
                        "POST",

                    body:
                        formData
                }
            );


        if (!response.ok) {

            throw new Error(
                "Backend request failed."
            );

        }


        const data =
            await response.json();


        if (!data.success) {

            throw new Error(
                data.message ||
                "Unable to start search."
            );

        }


        currentJobId =
            data.job_id;


        pollJob();

    }
    catch (
        error
    ) {

        showError(
            error.message ||
            "The photo search server is currently unavailable."
        );


        document
            .getElementById(
                "input-card"
            )
            .style.display =
                "block";


        document
            .getElementById(
                "status"
            )
            .style.display =
                "none";


        document
            .getElementById(
                "find-button"
            )
            .disabled =
                false;

    }

}


async function pollJob() {

    try {

        const response =
            await fetch(
                API_BASE +
                "/api/job/" +
                encodeURIComponent(
                    currentJobId
                )
            );


        if (!response.ok) {

            throw new Error(
                "Unable to read search status."
            );

        }


        const job =
            await response.json();


        document
            .getElementById(
                "status-text"
            )
            .innerText =
                job.message ||
                "Searching...";


        document
            .getElementById(
                "progress-bar"
            )
            .style.width =
                (
                    job.progress ||
                    0
                ) +
                "%";


        if (
            job.status ===
            "completed"
        ) {

            showResults(
                job
            );

            return;

        }


        if (
            job.status ===
            "error"
        ) {

            throw new Error(
                job.message ||
                "Search failed."
            );

        }


        setTimeout(
            pollJob,
            500
        );

    }
    catch (
        error
    ) {

        showError(
            error.message ||
            "Something went wrong."
        );

        document
            .getElementById(
                "status"
            )
            .style.display =
                "none";

        document
            .getElementById(
                "input-card"
            )
            .style.display =
                "block";

        document
            .getElementById(
                "find-button"
            )
            .disabled =
                false;

    }

}


function showResults(
    job
) {

    document
        .getElementById(
            "status"
        )
        .style.display =
            "none";


    document
        .getElementById(
            "results"
        )
        .style.display =
            "block";


    const results =
        job.results ||
        [];


    document
        .getElementById(
            "results-count"
        )
        .innerText =
            results.length +
            " matching photos";


    const gallery =
        document
            .getElementById(
                "gallery"
            );


    gallery.innerHTML =
        "";


    if (
        results.length ===
        0
    ) {

        gallery.innerHTML = `
            <div class="empty">
                We couldn't find a matching photo.
                Try another clear selfie.
            </div>
        `;

        return;

    }


    results.forEach(
        function(
            item,
            index
        ) {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "photo-card";


            const image =
                document.createElement(
                    "img"
                );


            image.src =
                API_BASE +
                "/api/image/" +
                encodeURIComponent(
                    currentJobId
                ) +
                "/" +
                index;


            image.loading =
                "lazy";


            image.alt =
                "Matched event photo";


            const info =
                document.createElement(
                    "div"
                );


            info.className =
                "photo-info";


            const name =
                document.createElement(
                    "div"
                );


            name.className =
                "photo-name";


            name.innerText =
                item.file_name;


            const download =
                document.createElement(
                    "a"
                );


            download.className =
                "download";


            download.href =
                API_BASE +
                "/api/download/" +
                encodeURIComponent(
                    currentJobId
                ) +
                "/" +
                index;


            download.innerText =
                "📥 Download Photo";


            download.target =
                "_blank";


            info.appendChild(
                name
            );


            info.appendChild(
                download
            );


            card.appendChild(
                image
            );


            card.appendChild(
                info
            );


            gallery.appendChild(
                card
            );

        }
    );

}


function startAgain() {

    document
        .getElementById(
            "results"
        )
        .style.display =
            "none";


    document
        .getElementById(
            "input-card"
        )
        .style.display =
            "block";


    document
        .getElementById(
            "file-input"
        )
        .value =
            "";


    selectedBlob =
        null;


    currentJobId =
        null;


    document
        .getElementById(
            "find-button"
        )
        .disabled =
            true;


    switchTab(
        "upload"
    );

}


function showError(
    message
) {

    const element =
        document
            .getElementById(
                "error"
            );


    element.innerText =
        message;


    element.style.display =
        "block";

}


function hideError() {

    document
        .getElementById(
            "error"
        )
        .style.display =
            "none";

}
