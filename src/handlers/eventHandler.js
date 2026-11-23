const fs = require('fs');
const path = require('path');

function loadEvents(client) {
    const eventsDir = path.join(__dirname, '..', 'events');
    if (!fs.existsSync(eventsDir)) return;

    const eventFiles = fs.readdirSync(eventsDir).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsDir, file);
        const event = require(filePath);

        if (!event?.name || typeof event.execute !== 'function') {
            console.warn(`[WARN] Event v ${filePath} nemá platnú vlastnosť "name" alebo "execute".`);
            continue;
        }

        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }
}

module.exports = { loadEvents };
