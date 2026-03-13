interface TrieNode<TValue> {
    children: Map<string, TrieNode<TValue>>;
    terminalValues: TValue[];
}

function createTrieNode<TValue>(): TrieNode<TValue> {
    return {
        children: new Map(),
        terminalValues: []
    };
}

function appendUnique<TValue>(target: TValue[], value: TValue) {
    if (target[target.length - 1] !== value && !target.includes(value)) {
        target.push(value);
    }
}

export default class Trie<TValue> {
    private readonly root: TrieNode<TValue>;

    constructor() {
        this.root = createTrieNode<TValue>();
    }

    insert(value: string, payload: TValue): void {
        if (value.length === 0) {
            return;
        }

        let node = this.root;
        for (const char of value) {
            let nextNode = node.children.get(char);
            if (!nextNode) {
                nextNode = createTrieNode<TValue>();
                node.children.set(char, nextNode);
            }

            node = nextNode;
        }

        appendUnique(node.terminalValues, payload);
    }

    insertMany(values: Iterable<string>, payload: TValue): void {
        for (const value of values) {
            this.insert(value, payload);
        }
    }

    search(prefix: string, limit = Number.POSITIVE_INFINITY): TValue[] {
        if (prefix.length === 0) {
            return [];
        }

        let node: TrieNode<TValue> | undefined = this.root;
        for (const char of prefix) {
            node = node.children.get(char);
            if (!node) {
                return [];
            }
        }

        const results: TValue[] = [];
        this.collect(node, results, limit);
        return results;
    }

    private collect(
        node: TrieNode<TValue>,
        results: TValue[],
        limit: number
    ): void {
        if (results.length >= limit) {
            return;
        }

        for (const value of node.terminalValues) {
            appendUnique(results, value);
            if (results.length >= limit) {
                return;
            }
        }

        for (const childNode of node.children.values()) {
            this.collect(childNode, results, limit);
            if (results.length >= limit) {
                return;
            }
        }
    }
}
