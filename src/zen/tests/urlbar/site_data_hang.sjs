/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

// Never answers, so the page stays blank and loading.
function handleRequest(request, response) {
  response.processAsync();
}
